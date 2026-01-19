import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Doclea",
  tagline: "Persistent memory for AI coding assistants",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://doclea.ai",
  baseUrl: "/",

  organizationName: "docleaai",
  projectName: "doclea-mcp",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  // Mermaid support
  markdown: {
    mermaid: true,
  },
  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/docleaai/doclea-mcp/tree/main/docs/",
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
          routeBasePath: "/",
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
          },
          editUrl: "https://github.com/docleaai/doclea-mcp/tree/main/docs/",
          onInlineTags: "warn",
          onInlineAuthors: "warn",
          onUntruncatedBlogPosts: "warn",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/doclea-social-card.png",
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Doclea",
      logo: {
        alt: "Doclea Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/api/overview",
          label: "API",
          position: "left",
        },
        { to: "/blog", label: "Blog", position: "left" },
        {
          href: "https://github.com/docleaai/doclea-mcp",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "Quick Start",
              to: "/quick-start",
            },
            {
              label: "API Reference",
              to: "/api/overview",
            },
            {
              label: "Configuration",
              to: "/configuration",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub Discussions",
              href: "https://github.com/docleaai/doclea-mcp/discussions",
            },
            {
              label: "Discord",
              href: "https://discord.gg/doclea",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "Blog",
              to: "/blog",
            },
            {
              label: "GitHub",
              href: "https://github.com/docleaai/doclea-mcp",
            },
            {
              label: "npm",
              href: "https://www.npmjs.com/package/@doclea/mcp",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Quantic Studios. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "typescript", "sql"],
    },
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
