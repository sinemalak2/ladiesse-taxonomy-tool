'use client';

import { useEffect, useState } from 'react';
import ProductList from '../components/ProductList.jsx';
import ProductTagger from '../components/ProductTagger.jsx';

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((json) => setCategories(json.categories));
  }, []);

  function handleCategoryValueAdded(categoryKey, values) {
    setCategories((prev) => prev.map((c) => (c.key === categoryKey ? { ...c, values } : c)));
  }

  return (
    <div className={`app-shell${selectedId ? ' show-detail' : ''}`}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div>
            <h1>Ladiesse Taxonomy</h1>
            <div className="tagline">Product Tagging</div>
          </div>
          <button
            type="button"
            className="logout-link"
            onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => (window.location.href = '/login'))}
          >
            Log out
          </button>
        </div>
        <ProductList
          selectedId={selectedId}
          onSelect={setSelectedId}
          refreshKey={refreshKey}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
      </div>
      <div className="detail-panel">
        {selectedId && categories.length > 0 ? (
          <>
            <button type="button" className="back-button" onClick={() => setSelectedId(null)}>
              ‹ Back to products
            </button>
            <ProductTagger
              productId={selectedId}
              categories={categories}
              onCategoryValueAdded={handleCategoryValueAdded}
              onTagsChanged={() => setRefreshKey((k) => k + 1)}
            />
          </>
        ) : (
          <div className="empty-state">Select a product to tag it</div>
        )}
      </div>
    </div>
  );
}
