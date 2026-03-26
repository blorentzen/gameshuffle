"use client";

import { useState, useEffect } from "react";
import { Button, Input } from "@empac/cascadeds";
import { getImagePath } from "@/lib/images";
import { getRandomNumber } from "@/lib/randomizer";
import { useAuth } from "@/components/auth/AuthProvider";
import { saveConfig } from "@/lib/configs";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { Item } from "@/data/types";
import type { ItemSetConfig } from "@/data/config-types";

interface ItemRandomizerProps {
  items: Item[];
  gameSlug: string;
  initialSelectedItems?: Set<string> | null;
  onSelectionChange?: (selectedNames: string[]) => void;
}

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "offensive", label: "Offensive" },
  { value: "defensive", label: "Defensive" },
  { value: "boost", label: "Boost" },
  { value: "special", label: "Special" },
];

export function ItemRandomizer({ items, gameSlug, initialSelectedItems, onSelectionChange }: ItemRandomizerProps) {
  const { user } = useAuth();
  const { trackEvent } = useAnalytics();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    initialSelectedItems || new Set(items.map((i) => i.name))
  );
  const [randomCount, setRandomCount] = useState(
    initialSelectedItems ? initialSelectedItems.size : 8
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  useEffect(() => {
    onSelectionChange?.(Array.from(selectedItems));
  }, [selectedItems, onSelectionChange]);

  const filteredItems =
    categoryFilter === "all"
      ? items
      : items.filter((i) => i.category === categoryFilter);

  const toggleItem = (name: string) => {
    const next = new Set(selectedItems);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedItems(next);
  };

  const selectAll = () => setSelectedItems(new Set(items.map((i) => i.name)));
  const clearAll = () => setSelectedItems(new Set());

  const randomizeItems = () => {
    const pool = [...items];
    const count = Math.min(randomCount, pool.length);
    const picked = new Set<string>();

    while (picked.size < count) {
      const idx = getRandomNumber(pool.length);
      picked.add(pool[idx].name);
    }

    setSelectedItems(picked);
    trackEvent("Randomize Items", { count: String(count) });
  };

  const handleSave = async () => {
    if (!user) {
      window.location.href = "/signup";
      return;
    }
    if (!saveName.trim()) return;

    const activeItems = items.filter((i) => selectedItems.has(i.name));
    const configData: ItemSetConfig = {
      type: "item-set",
      gameSlug,
      items: activeItems.map((i) => ({ name: i.name, img: i.img })),
    };

    const result = await saveConfig(user.id, gameSlug, saveName.trim(), configData);

    if (result.error) {
      setSaveResult(result.error);
    } else {
      setSaveResult("Saved!");
      setShowSave(false);
      setSaveName("");
      setTimeout(() => setSaveResult(null), 3000);
    }
  };

  const activeCount = selectedItems.size;

  return (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Customize your item set.</h2>
          <p>
            Toggle items on or off to create a custom item pool for your race
            series, or randomize a set.
          </p>
          <div className="kart-intro__actions">
            <div className="item-count-picker">
              <span>Random</span>
              <input
                type="number"
                min={1}
                max={items.length}
                value={randomCount}
                onChange={(e) => setRandomCount(Number(e.target.value))}
                className="item-count-picker__input"
              />
              <span>items</span>
            </div>
            <Button variant="primary" size="small" onClick={randomizeItems}>
              Randomize Items
            </Button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <Button variant="secondary" size="small" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="secondary" size="small" onClick={clearAll}>
              Clear All
            </Button>
          </div>
        </div>

        <div>
          <h2 style={{ marginBottom: "2rem" }}>
            Filter by category
          </h2>
          <div className="filter-group__buttons">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={categoryFilter === cat.value ? "primary" : "secondary"}
                size="small"
                onClick={() => setCategoryFilter(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          <p style={{ marginTop: "1rem", fontSize: "14px", color: "#606060" }}>
            <strong>{activeCount}</strong> of {items.length} items active
          </p>
        </div>
      </div>

      <div className="item-grid">
        {filteredItems.map((item) => {
          const isActive = selectedItems.has(item.name);
          return (
            <button
              key={item.name}
              className={`item-card ${isActive ? "item-card--active" : ""}`}
              onClick={() => toggleItem(item.name)}
            >
              <img
                src={getImagePath(item.img)}
                alt={item.name}
                className="item-card__img"
              />
              <span className="item-card__name">{item.name}</span>
              <span className="item-card__category">{item.category}</span>
            </button>
          );
        })}
      </div>

      <div className="item-save-bar">
        {showSave ? (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Input
              type="text"
              placeholder="Name this item set (e.g. No Blue Shell)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
            <Button variant="primary" size="small" onClick={handleSave} disabled={!saveName.trim()}>
              Save
            </Button>
            <Button variant="ghost" size="small" onClick={() => setShowSave(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => {
            if (!user) { window.location.href = "/signup"; return; }
            setShowSave(true);
          }}>
            Save Item Set
          </Button>
        )}
        {saveResult && (
          <span style={{ fontSize: "14px", fontWeight: 600, color: saveResult === "Saved!" ? "#17A710" : "#C11A10" }}>
            {saveResult}
          </span>
        )}
      </div>
    </section>
  );
}
