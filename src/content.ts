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
    body: ["Card 1 desc.", "Scroll down ↓"],
  },
  {
    label: "About",
    title: "/// About",
    body: ["Card 2 desc."],
  },
  {
    label: "Projects",
    title: "/// Projects",
    body: ["Projects:"],
    links: [
      { label: "Project 1", url: "https://example.com" },
      { label: "Project 2", url: "https://example.com" },
      { label: "Project 3", url: "https://example.com" },
    ],
  },
  {
    label: "Contacts",
    title: "/// Contacts",
    links: [{ label: "GitHub", url: "https://github.com/ss123she" }],
  },
];
