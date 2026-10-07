"use client";

/**
 * CDS `Combobox` with the accessibility it doesn't set itself yet: the text
 * field gets role="combobox" (CDS puts aria-expanded on a plain input, which
 * screen readers can't interpret and axe flags as critical) and an accessible
 * name (CDS has no label prop, so the placeholder was the only name, which
 * disappears as you type). WCAG 4.1.2 Name, Role, Value.
 *
 * A thin wrapper, per the CDS-first rule: the widget is still CDS's. Remove
 * this once CascadeDS's Combobox takes a label and sets the role (raised as a
 * CDS gap, along with aria-controls / aria-activedescendant for the list).
 */

import { useEffect, useRef } from "react";
import { Combobox, type ComboboxProps } from "@empac/cascadeds";

export function LabeledCombobox({ label, ...props }: ComboboxProps & { label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = wrap.current?.querySelector<HTMLInputElement>("input.empac-combobox__input");
    if (!input) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", label);
  }, [label]);
  return <div ref={wrap} className="labeled-combobox"><Combobox {...props} /></div>;
}
