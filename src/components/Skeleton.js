import React from "react";
import "./Skeleton.css";

/**
 * Skeleton — placeholder block with shimmer animation. Use in place of
 * spinners/loaders when the final shape is known. Keeps page layout stable
 * (no jump when real data arrives) and feels faster than a generic loader.
 *
 * Props:
 *   width   — CSS width (e.g. "100%", "180px", 80)
 *   height  — CSS height (e.g. "1.2rem", "40px", 16)
 *   radius  — border-radius (default 6px). Use "50%" for circular avatars.
 *   block   — render as block element instead of inline (defaults to inline)
 *   style   — extra inline styles
 *   className — extra classes to merge
 */
export default function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  block = false,
  style = {},
  className = "",
}) {
  const Tag = block ? "div" : "span";
  const sized = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius: typeof radius === "number" ? `${radius}px` : radius,
    ...style,
  };
  return <Tag className={`skeleton ${className}`} style={sized} aria-hidden="true" />;
}

/**
 * SkeletonText — multi-line skeleton for paragraphs.
 * Last line is shorter (3/5 width) to look like real text.
 */
export function SkeletonText({ lines = 3, gap = 8, lineHeight = 12 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? "60%" : "100%"}
          block
        />
      ))}
    </div>
  );
}
