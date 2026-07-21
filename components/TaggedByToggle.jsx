'use client';

const STYLISTS = ['Ipek', 'Sino'];

export default function TaggedByToggle({ value, onChange }) {
  return (
    <div className="tagged-by-toggle">
      {STYLISTS.map((name) => (
        <button
          key={name}
          className={value === name ? 'active' : ''}
          onClick={() => onChange(name)}
          type="button"
        >
          {name}
        </button>
      ))}
    </div>
  );
}
