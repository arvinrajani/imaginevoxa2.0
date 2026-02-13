import { getDefaultLayoutSpec } from "./compositor";

const baseLayout = getDefaultLayoutSpec();

export const DEFAULT_IMAGE_PROFILES = [
  {
    name: "Hiring Post",
    category: "hiring",
    description: "Announce open roles with clear hierarchy and CTA.",
    layout_spec: baseLayout,
    allowed_text_zones: ["label", "title", "meta", "cta"],
    logo_rules: { position: "top-right", min_clearspace: 12 },
    label_rules: { default_label: "WE ARE HIRING" },
    typography_hierarchy: {
      label: "uppercase",
      title: "bold",
      meta: "regular",
      cta: "bold",
    },
  },
  {
    name: "Product Launch",
    category: "product",
    description: "Highlight a new product or feature.",
    layout_spec: baseLayout,
    allowed_text_zones: ["label", "title", "meta", "cta"],
    logo_rules: { position: "top-right", min_clearspace: 12 },
    label_rules: { default_label: "NEW LAUNCH" },
    typography_hierarchy: {
      label: "uppercase",
      title: "bold",
      meta: "regular",
      cta: "bold",
    },
  },
  {
    name: "Announcement",
    category: "announcement",
    description: "Share an important update with a bold headline.",
    layout_spec: baseLayout,
    allowed_text_zones: ["label", "title", "meta", "cta"],
    logo_rules: { position: "top-right", min_clearspace: 12 },
    label_rules: { default_label: "ANNOUNCEMENT" },
    typography_hierarchy: {
      label: "uppercase",
      title: "bold",
      meta: "regular",
      cta: "bold",
    },
  },
  {
    name: "Thought Leadership",
    category: "thought_leadership",
    description: "Credible, calm design for insight-driven posts.",
    layout_spec: baseLayout,
    allowed_text_zones: ["label", "title", "meta"],
    logo_rules: { position: "top-right", min_clearspace: 12 },
    label_rules: { default_label: "INSIGHT" },
    typography_hierarchy: {
      label: "uppercase",
      title: "bold",
      meta: "regular",
    },
  },
];
