"use client";

/**
 * The site's Select: the CDS Select, plus support for an option whose value
 * is "" ("Any", "None", "Pick a game"). CDS treats "" as no choice, so it
 * hides that option's label and shows "Select an option…" instead; here the
 * empty value rides on a stand-in and comes back as "" in onChange. Selects
 * without an empty-value option (and multi-selects) pass straight through.
 *
 * Drop-in: import { Select } from "@/components/ui/Select" instead of from
 * "@empac/cascadeds". A CDS gap to raise upstream (an empty-value option).
 */

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Select as CdsSelect } from "@empac/cascadeds";

type Props = ComponentPropsWithoutRef<typeof CdsSelect>;
type Option = NonNullable<Props["options"]>[number];

const EMPTY = "__empty__";
const swap = (o: Option): Option => (o.value === "" ? { ...o, value: EMPTY } : o);

export const Select = forwardRef<HTMLButtonElement, Props>(function Select({ value, onChange, options, groups, multiple, ...rest }, ref) {
  const hasEmpty = !!options?.some((o) => o.value === "") || !!groups?.some((g) => g.options.some((o) => o.value === ""));
  if (multiple || !hasEmpty) {
    return <CdsSelect ref={ref} value={value} onChange={onChange} options={options} groups={groups} multiple={multiple} {...rest} />;
  }
  return (
    <CdsSelect
      ref={ref}
      {...rest}
      value={value === "" ? EMPTY : value}
      options={options?.map(swap)}
      groups={groups?.map((g) => ({ ...g, options: g.options.map(swap) }))}
      onChange={onChange ? (v) => onChange(v === EMPTY ? "" : v) : undefined}
    />
  );
});
