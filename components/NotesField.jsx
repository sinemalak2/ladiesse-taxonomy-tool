'use client';

import { useEffect, useState } from 'react';

export default function NotesField({ productId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(initialNotes ?? '');
  }, [productId, initialNotes]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/products/${encodeURIComponent(productId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notes-block">
      <h3 className="cat-label">Stylist Notes</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Freeform notes..."
      />
      {saving && <div className="status-text">Saving...</div>}
    </div>
  );
}
