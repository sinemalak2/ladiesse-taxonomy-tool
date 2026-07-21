'use client';

import { useEffect, useState } from 'react';

export default function ProductList({ selectedId, onSelect, refreshKey, onSynced }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ products: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set('search', search.trim());

    fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, refreshKey]);

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
      {syncMessage && <div className="status-text">{syncMessage}</div>}

      <div className="product-list">
        {loading && <div className="status-text">Loading...</div>}
        {!loading && data.products.length === 0 && <div className="status-text">No products found.</div>}
        {data.products.map((p) => (
          <div
            key={p.id}
            className={`product-row${p.id === selectedId ? ' selected' : ''}`}
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
