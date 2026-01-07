import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    'quick-start',
    {
      type: 'category',
      label: 'Installation',
      collapsed: true,
      items: [
        'installation/overview',
        'installation/zero-config',
        'installation/docker',
        'installation/verification',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/memory-management',
        'guides/git-integration',
        'guides/code-expertise',
        'guides/context-building',
      ],
    },
    {
      type: 'category',
      label: 'Cookbook',
      collapsed: true,
      items: [
        'cookbook/architecture-decisions',
        'cookbook/bug-fix-solutions',
        'cookbook/code-patterns',
        'cookbook/team-workflows',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: [
        'api/overview',
        {
          type: 'category',
          label: 'Memory Tools',
          items: [
            'api/memory/store',
            'api/memory/search',
            'api/memory/get',
            'api/memory/update',
            'api/memory/delete',
          ],
        },
        {
          type: 'category',
          label: 'Git Tools',
          items: [
            'api/git/commit-message',
            'api/git/pr-description',
            'api/git/changelog',
          ],
        },
        {
          type: 'category',
          label: 'Expertise Tools',
          items: [
            'api/expertise/mapping',
            'api/expertise/reviewers',
          ],
        },
        {
          type: 'category',
          label: 'Bootstrap Tools',
          items: [
            'api/bootstrap/init',
            'api/bootstrap/import',
          ],
        },
      ],
    },
    'configuration',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: true,
      items: [
        'architecture/overview',
        'architecture/storage',
        'architecture/embeddings',
        {
          type: 'category',
          label: 'Chunking',
          collapsed: true,
          items: [
            'architecture/chunking/overview',
            'architecture/chunking/markdown',
            'architecture/chunking/code',
          ],
        },
        'architecture/vector-search',
        'architecture/retrieval-strategies',
      ],
    },
    'troubleshooting',
    'faq',
    'contributing',
  ],
};

export default sidebars;
