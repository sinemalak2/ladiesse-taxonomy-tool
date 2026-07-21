'use client';

import { useCallback, useEffect, useState } from 'react';

export default function ProductList({ selectedId, onSelect, refreshKey, onSynced }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ products: [], totalPages: 1, total: 0, markedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set('search', search.trim());

    return fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProducts, refreshKey]);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setSyncMessage(`Created ${json.created}, updated ${json.updated}, unchanged ${json.unchanged}`);
      onSynced?.();
    } catch (err) {
      setSyncMessage(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleMark(e, product) {
    e.stopPropagation();
    const marked = !product.marked_for_removal;
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === product.id ? { ...p, marked_for_removal: marked } : p)),
      markedCount: prev.markedCount + (marked ? 1 : -1),
    }));
    await fetch(`/api/products/${encodeURIComponent(product.id)}/mark-removal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marked }),
    });
  }

  async function handleBulkDelete() {
    const count = data.markedCount ?? 0;
    if (count === 0) return;
    const ok = window.confirm(
      `Delete ${count} product${count === 1 ? '' : 's'} marked for removal from Shopify? This cannot be undone.`
    );
    if (!ok) return;

    setBulkDeleting(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/products/bulk-delete', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk delete failed');
      const failedNote = json.failed.length > 0 ? ` (${json.failed.length} failed — see logs)` : '';
      setSyncMessage(`Deleted ${json.succeeded} of ${json.total} marked product(s).${failedNote}`);

      const selectedProduct = data.products.find((p) => p.id === selectedId);
      const selectedWasMarked = selectedProduct?.marked_for_removal;
      const selectedStillFailed = json.failed.some((f) => f.id === selectedId);
      if (selectedWasMarked && !selectedStillFailed) {
        onSelect(null);
      }
      await fetchProducts();
    } catch (err) {
      setSyncMessage(err.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  const markedCount = data.markedCount ?? 0;

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-gold" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>
      {markedCount > 0 && (
        <div className="toolbar">
          <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting} style={{ width: '100%' }}>
            {bulkDeleting ? 'Deleting...' : `Delete ${markedCount} marked from Shopify`}
          </button>
        </div>
      )}
      {syncMessage && <div className="status-text">{syncMessage}</div>}

      <div className="product-list">
        {loading && <div className="status-text">Loading...</div>}
        {!loading && data.products.length === 0 && <div className="status-text">No products found.</div>}
        {data.products.map((p) => (
          <div
            key={p.id}
            className={`product-row${p.id === selectedId ? ' selected' : ''}${p.marked_for_removal ? ' marked' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            {p.image_url ? <img src={p.image_url} alt="" /> : <div className="product-row-placeholder" style={{ width: 40, height: 52, background: 'var(--color-line)' }} />}
            <div className="meta">
              <div className="title">{p.title}</div>
              <div className="sub">
                {p.price != null ? `$${Number(p.price).toFixed(2)}` : '—'} · {p.status}
              </div>
            </div>
            <div className="tag-progress">
              {p.tagged_count}/{p.total_categories}
            </div>
            <button
              type="button"
              className={`mark-toggle${p.marked_for_removal ? ' marked' : ''}`}
              onClick={(e) => handleToggleMark(e, p)}
              title={p.marked_for_removal ? 'Unmark for removal' : 'Mark for removal'}
            >
              {p.marked_for_removal ? 'Marked' : 'Mark'}
            </button>
          </div>
        ))}
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span>
          Page {data.page ?? page} of {data.totalPages ?? 1} ({data.total ?? 0} products)
        </span>
        <button className="btn" disabled={page >= (data.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
