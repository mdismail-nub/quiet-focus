import type { LandscapeTheme } from "./focus-store";

export type LandscapeThemeOption = {
  id: LandscapeTheme;
  name: string;
  description: string;
  swatchBg: string;
  swatchAccent: string;
  swatchText: string;
};

export const LANDSCAPE_THEMES: LandscapeThemeOption[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Warm cream",
    swatchBg: "#F6F0E6",
    swatchAccent: "#C6783A",
    swatchText: "#231F1A",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep charcoal & navy",
    swatchBg: "#0E1525",
    swatchAccent: "#79A8FF",
    swatchText: "#EFF3FA",
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm peach & orange",
    swatchBg: "#F9D6BE",
    swatchAccent: "#D85A22",
    swatchText: "#2E1911",
  },
  {
    id: "forest",
    name: "Forest",
    description: "Muted green tones",
    swatchBg: "#18271E",
    swatchAccent: "#80B98C",
    swatchText: "#ECF1EC",
  },
];
