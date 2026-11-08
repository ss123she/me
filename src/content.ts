export interface Stop {
  label: string;
  title: string;
  body?: string[];
  links?: { label: string; url: string }[];
}

export const STOPS: Stop[] = [
  {
    label: "Hi",
    title: "/// Hi",
    body: [
      "Hey, I'm Aleksandr (@ss123she).",
      "Software developer focused on systems programming, graphics, and tools.",
      "Scroll down ↓",
    ],
  },
  {
    label: "About",
    title: "/// About",
    body: [
      "Mainly working with Rust, C#, and C++.",
      "Interested in low-level engineering, compute shaders, voxel engines, and creative coding.",
      "Building open-source libraries and experimenting with custom runtimes.",
    ],
  },
  {
    label: "Projects",
    title: "/// Projects",
    body: ["Key open-source projects:"],
    links: [
      {
        label: "punctum - Compute shaders framework in pure Rust",
        url: "https://github.com/ss123she/punctum",
      },
      {
        label: "yson-rs - YSON format parser/serializer in Rust",
        url: "https://github.com/ss123she/yson-rs",
      },
      {
        label: "duckdb-derive - Derive workspace macros for DuckDB",
        url: "https://github.com/ss123she/duckdb-derive-workspace",
      },
      {
        label: "lazymcp - MCP in Rust",
        url: "https://github.com/ss123she/lazymcp",
      },
    ],
  },
  {
    label: "Contacts",
    title: "/// Contacts",
    body: ["Find more of my work and activity online:"],
    links: [
      { label: "GitHub", url: "https://github.com/ss123she" },
      {
        label: "Discord",
        url: "https://discord.com/users/815840955684880404",
      },
    ],
  },
];
