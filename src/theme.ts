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
    "--radius-element": "6px",
    "--radius-container": "10px",
  },
});
