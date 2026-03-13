'use client';

import { useState, useMemo } from 'react';
import type { Brand } from '@/lib/types';

interface BrandSelectorProps {
  brands: Brand[];
  selectedBrandId: string | null;
  onSelect: (brandId: string | null) => void;
}

export default function BrandSelector({ brands, selectedBrandId, onSelect }: BrandSelectorProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return brands;
    const q = search.toLowerCase();
    return brands.filter(
      (b) =>
        b.display_name.toLowerCase().includes(q) ||
        b.brand_id.toLowerCase().includes(q)
    );
  }, [brands, search]);

  const selectedBrand = brands.find((b) => b.brand_id === selectedBrandId);
  const displayLabel = selectedBrand ? selectedBrand.display_name : 'All Brands';

  function handleSelect(brandId: string | null) {
    onSelect(brandId);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div className="relative inline-block w-80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#4C9784]"
      >
        <span className="truncate">{displayLabel}</span>
        <svg className="ml-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#4C9784]"
              autoFocus
            />
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-[#e8f4f1] ${
                  selectedBrandId === null ? 'bg-[#e8f4f1] font-semibold text-[#3a7868]' : 'text-gray-700'
                }`}
              >
                All Brands
              </button>
            </li>
            {filtered.map((brand) => (
              <li key={brand.brand_id}>
                <button
                  type="button"
                  onClick={() => handleSelect(brand.brand_id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-[#e8f4f1] ${
                    selectedBrandId === brand.brand_id
                      ? 'bg-[#e8f4f1] font-semibold text-[#3a7868]'
                      : 'text-gray-700'
                  }`}
                >
                  <span>{brand.display_name}</span>
                  <span className="ml-2 text-gray-400 text-xs">({brand.brand_id})</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-2 text-sm text-gray-400">No brands found</li>
            )}
          </ul>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setIsOpen(false); setSearch(''); }}
        />
      )}
    </div>
  );
}
