import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

export const workbenchTheme = defineTheme({
  name: "intake-workbench",
  extends: neutralTheme,
  tokens: {
    "--font-family-body": fontFamily,
    "--font-family-heading": fontFamily,
    "--font-size-4xs": "12px",
    "--font-size-3xs": "12px",
    "--font-size-2xs": "12px",
    "--font-size-xs": "12px",
    "--font-size-lg": "16px",
    "--font-size-3xl": "24px",
    "--font-size-4xl": "24px",
    "--font-size-5xl": "24px",
    "--font-weight-bold": "600",
    "--radius-element": "4px",
    "--radius-container": "8px",
    "--radius-page": "8px",
    "--radius-chat": "8px",
    "--spacing-0-5": "4px",
    "--spacing-1-5": "8px",
  },
});
