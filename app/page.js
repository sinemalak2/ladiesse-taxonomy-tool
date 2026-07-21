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
    <div className="app-shell">
      <div className="sidebar">
        <h1>Ladiesse Taxonomy</h1>
        <div className="tagline">Product Tagging</div>
        <ProductList
          selectedId={selectedId}
          onSelect={setSelectedId}
          refreshKey={refreshKey}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
      </div>
      <div className="detail-panel">
        {selectedId && categories.length > 0 ? (
          <ProductTagger
            productId={selectedId}
            categories={categories}
            onCategoryValueAdded={handleCategoryValueAdded}
          />
        ) : (
          <div className="empty-state">Select a product to tag it</div>
        )}
      </div>
    </div>
  );
}
