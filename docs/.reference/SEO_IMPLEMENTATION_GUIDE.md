# Doclea SEO Implementation Guide

Quick reference for implementing the SEO strategy from SEO_STRATEGY.md

---

## 1. Page Template: Documentation Guide

**Use for:** All guide pages (memory-management.md, git-integration.md, etc.)

```markdown
---
title: "Complete Guide to [Topic]: [Primary Keyword]"
description: "Learn [primary keyword]. Covers [key subtopic 1], [key subtopic 2], and best practices for developers using [tool/context]."
keywords: ["primary keyword", "secondary keyword", "related keyword"]
sidebar_position: 2
---

# [H1: Keyword-Rich Title]

## Introduction

[100-150 words: Problem statement + value proposition]

**In this guide, you'll learn:**
- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]

## Section 1: [H2 with keyword]

[Content with examples, code snippets]

### Subsection 1A: [H3]

[Detailed explanation with real examples]

### Subsection 1B: [H3]

[Another angle on the topic]

## Section 2: [H2 with keyword]

[Continue pattern]

## Best Practices

- Practice 1
- Practice 2
- Practice 3

## Common Mistakes

### Mistake 1

[Explanation + how to avoid]

### Mistake 2

[Explanation + how to avoid]

## Next Steps

[Link to related guide/API/blog post]

## Related Resources

- [Internal link 1]
- [Internal link 2]
- [External authority source 1]
```

---

## 2. Page Template: Blog Post

**Use for:** All blog posts

```markdown
---
title: "[Keyword-Rich Title That Doesn't Sound Forced]"
description: "Learn [primary keyword]. This guide covers [key points] and includes real examples and actionable advice."
authors: [{name: "Author Name", url: "https://twitter.com/handle"}]
date: 2024-12-10
tags: ["doclea", "topic", "ai-coding"]
image: "/img/blog/post-title-cover.png"
---

# [H1: Article Title]

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

[2-3 sentence hook that identifies the problem or opportunity]

<!-- More content below this line... -->

## The Problem [H2]

[Explain the pain point in detail]

## Why This Matters [H2]

[Connect to reader's goals]

## Section 1: [H2 with keyword]

### Key Point A [H3]

[Explanation with examples]

```code example here
```

### Key Point B [H3]

[More explanation]

## Section 2: [H2 with keyword]

[Continue pattern]

## Real Example [H2]

[Concrete example: before/after, case study, or walkthrough]

## Implementation [H2]

[Step-by-step guide if applicable]

<Tabs>
  <TabItem value="option1" label="Option 1: Simple Setup">

```bash
code for simple setup
```

  </TabItem>
  <TabItem value="option2" label="Option 2: Advanced Setup">

```bash
code for advanced setup
```

  </TabItem>
</Tabs>

## Common Mistakes to Avoid [H2]

- Mistake 1: [Issue] → [Solution]
- Mistake 2: [Issue] → [Solution]

## Key Takeaways [H2]

- Takeaway 1
- Takeaway 2
- Takeaway 3

## Next Steps [H2]

[CTA to related docs/next blog post]

:::info
Related: [Internal link 1] and [Internal link 2]
:::
```

---

## 3. Adding Schema Markup to Docusaurus

### Step 1: Modify `docusaurus.config.ts`

Add to the config object:

```typescript
// In themeConfig
customFields: {
  organizationName: 'Quantic Studios',
  organizationUrl: 'https://quanticstudios.com',
  organizationLogo: 'https://doclea.ai/img/logo.svg',
},
```

### Step 2: Create Schema Component

File: `/docs/src/components/SchemaMarkup.tsx`

```typescript
import React from 'react';
import Head from '@docusaurus/Head';

interface SchemaMarkupProps {
  type: 'Article' | 'BlogPosting' | 'TechArticle' | 'FAQPage';
  title: string;
  description: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  content?: string;
  faqs?: Array<{question: string; answer: string}>;
}

export default function SchemaMarkup({
  type,
  title,
  description,
  image,
  datePublished,
  dateModified,
  author,
  content,
  faqs,
}: SchemaMarkupProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': type,
    headline: title,
    description: description,
    image: image || 'https://doclea.ai/img/doclea-social-card.png',
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    author: {
      '@type': 'Organization',
      name: author || 'Doclea',
      url: 'https://doclea.ai',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Doclea',
      logo: {
        '@type': 'ImageObject',
        url: 'https://doclea.ai/img/logo.svg',
      },
    },
    ...(content && { articleBody: content }),
    ...(faqs && {
      mainEntity: faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    }),
  };

  return (
    <Head>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Head>
  );
}
```

### Step 3: Use in Pages

```typescript
import SchemaMarkup from '@site/src/components/SchemaMarkup';

export default function MemoryManagement() {
  return (
    <>
      <SchemaMarkup
        type="TechArticle"
        title="Complete Guide to Doclea Memory Management"
        description="Learn how to store and retrieve memories in Doclea..."
        datePublished="2024-12-10"
        dateModified="2024-12-10"
      />
      {/* Rest of page content */}
    </>
  );
}
```

---

## 4. Front Matter Standards for All Pages

### Documentation Pages

```yaml
---
title: "Keyword: Descriptive Title"
description: "150-160 character meta description with primary keyword."
keywords: ["primary", "secondary", "related"]
sidebar_position: 2
---
```

### Blog Posts

```yaml
---
title: "Keyword-Rich Title"
description: "160-character meta description summarizing post value."
authors: [{name: "Author Name", url: "https://twitter.com/handle"}]
date: 2024-12-10
tags: ["doclea", "topic", "subtopic"]
image: "/img/blog/slug-cover.png"
slug: doclea-keyword-slug
---
```

---

## 5. Internal Linking Map

### From Homepage

```
Homepage
├─> Getting Started (all visitors)
├─> Memory Management Guide (interested in features)
├─> Latest Blog Posts (interested in learning)
└─> GitHub (interested in code/contributing)
```

### From Getting Started

```
Getting Started
├─> Memory Management Guide (next logical step)
├─> Configuration (for setup questions)
├─> Troubleshooting (if setup fails)
├─> Blog: "Your First 5 Minutes" (help people get started)
└─> API Overview (reference)
```

### From Memory Management Guide

```
Memory Management
├─> Semantic Search Deep Dive (architectural detail)
├─> Vector Search (technical depth)
├─> API: Store Tool (reference)
├─> API: Search Tool (reference)
├─> Configuration (embedding providers affect memory)
├─> Blog: "Code Knowledge Base" (practical examples)
└─> Blog: "Building Memory Workflows" (advanced usage)
```

### From Blog Posts

```
Blog Post: How Claude Code Loses Context
├─> Getting Started (solution)
├─> Memory Management Guide (deeper learning)
├─> Blog: Next Post (continued reading)
└─> Related Posts (same topic)

Blog Post: Doclea vs. Mem0
├─> Getting Started (why choose Doclea)
├─> Configuration (see customization options)
├─> GitHub (contribute or star)
```

---

## 6. Publishing Checklist

Before publishing any page:

### Content Quality

- [ ] Minimum 1500 words (guides) or 2000 words (blog)
- [ ] Primary keyword appears 3-5 times naturally
- [ ] Secondary keywords appear 1-2 times
- [ ] H2 headers include keywords where relevant
- [ ] Code examples are runnable and correct
- [ ] External links to 2-4 authoritative sources
- [ ] Personal voice/examples (not AI-generic)

### SEO

- [ ] Title is 50-60 characters, keyword-relevant
- [ ] Meta description is 150-160 characters, primary keyword early
- [ ] H1 matches title or closely matches
- [ ] H2/H3 hierarchy is logical
- [ ] URL is descriptive and under 75 characters
- [ ] Schema markup added (if supported type)
- [ ] Canonical tag present (Docusaurus auto-adds)
- [ ] Featured image optimized (< 200KB, 1200x630px for blog)

### UX

- [ ] Readability score 70+ (Hemingway, Grammarly)
- [ ] Average sentence < 20 words
- [ ] Average paragraph 3-4 sentences
- [ ] Key points in bold
- [ ] Lists used for readability
- [ ] Code syntax highlighting correct
- [ ] Images have alt text
- [ ] CTA clear and actionable

### Internal Linking

- [ ] 3-5 internal links per page
- [ ] Links are contextual, not spammy
- [ ] Links point to relevant page (not homepage)
- [ ] Anchor text is descriptive
- [ ] No broken internal links

### Final QA

- [ ] Page renders correctly on desktop/mobile
- [ ] Links work (internal and external)
- [ ] Code blocks copy correctly
- [ ] Images load correctly
- [ ] Meta description displays in search (test in browser)
- [ ] No spelling/grammar errors
- [ ] Author bio/info correct (for blog posts)
- [ ] Tags are relevant (for blog posts)

---

## 7. Keyword Research Process

### For Each Topic, Follow This Process:

1. **Identify Problem/Topic**
   - e.g., "How developers manage code context"

2. **Primary Keyword Selection**
   - Use Google Trends, Ahrefs, or SEMrush
   - Look for: 5-30 searches/month, low competition
   - Should be directly relevant to page

3. **Secondary Keywords**
   - Variations on primary keyword
   - Related problems (semantic)
   - Long-tail versions (more specific)
   - Example: Primary "semantic search code" → Secondary "code pattern matching", "architectural decision search"

4. **Keyword Placement**
   - Title: primary keyword
   - Meta description: primary keyword in first 80 chars
   - H1: primary keyword or synonym
   - First 100 words: mention primary + secondary
   - H2s: include secondary keywords naturally
   - Throughout: aim for 1-2% keyword density (not forced)

### Free Tools to Use

- **Google Suggest:** Start typing in Google, see suggestions
- **Google Trends:** Compare keyword search volume over time
- **AnswerThePublic:** See related questions people ask
- **Semrush Free:** Keyword research, competitor analysis
- **Ubersuggest Free:** Keyword ideas from Google data
- **Moz Keyword Explorer:** Free tier available

---

## 8. Measuring Success: Monthly Reporting

### Google Search Console

**Check Monthly:**

1. **Coverage**
   - Total indexed pages (should grow: +5-10/month in year 1)
   - Errors section (fix crawl errors immediately)

2. **Performance**
   - Total clicks from organic search
   - Average CTR (target: 3-5% for guides)
   - Top 20 queries (which keywords are driving traffic?)
   - Top 20 pages (which content resonates?)

3. **Enhancements**
   - Rich results status (FAQ, ArticleMarkup, etc.)
   - Mobile usability (should be all green)
   - Core Web Vitals (target: all green)

### Google Analytics 4

**Set Up These Goals/Conversions:**

1. "Time on page > 2 min"
   - Indicates content quality
   - Expected: 30% conversion on guides

2. "Visited 3+ pages"
   - Indicates engagement
   - Expected: 20% of organic sessions

3. "Scrolled to 75% of page"
   - Indicates content quality
   - Expected: 60% of organic sessions

4. "Clicked GitHub link"
   - Shows interest in project
   - Expected: 5% of docs visitors

### Monthly Report Template

```
DOCLEA SEO REPORT - [MONTH]

TRAFFIC
Organic Sessions:     [X]   (vs [prev month]: [+/-]%)
Organic Users:        [X]   (vs [prev month]: [+/-]%)
Bounce Rate:          [X]%  (target: <60%)
Avg Session Duration: [X]m  (target: >2m)

KEYWORDS (Top 10 by Position)
1. [keyword] - Position [#], Clicks [X]
2. ...

TOP CONTENT (by organic traffic)
1. [Page] - [X] views, [X]m avg time
2. ...

HIGHLIGHTS
- [Notable wins, new rankings, traffic spikes]

CHALLENGES
- [Areas underperforming, pages with high bounce]

NEXT MONTH PRIORITIES
1. [Content to create or update]
2. [Technical SEO improvements]
3. [Internal linking opportunities]
```

---

## 9. Content Expansion Checklist

### Every 2 Weeks, Update Existing Content

When content is 30+ days old:

- [ ] Check ranking position in GSC
- [ ] Update statistics/examples if outdated
- [ ] Add new internal links (if new content published)
- [ ] Improve meta description if CTR is low
- [ ] Expand sections with higher search volume keywords
- [ ] Fix any broken links
- [ ] Update "last modified" date in frontmatter

### Add "Last Updated" Widget to Blog

In blog posts, add before content:

```markdown
:::note Last Updated
This post was last updated on [DATE]. [Optional: what changed]
:::
```

This signals to search engines that content is fresh.

---

## 10. Common Mistakes to Avoid

### Content

❌ Keyword stuffing (feels unnatural)
✅ Natural keyword placement in context

❌ Thin content (< 1500 words)
✅ Comprehensive, detailed content (2000+ words)

❌ Copying content from README
✅ Expanding and adding unique insights to documentation

❌ Generic AI-written content
✅ Personal voice, developer-specific examples

### SEO

❌ No meta descriptions
✅ Unique, compelling meta description on every page

❌ Same meta description across pages
✅ Customized for each page/keyword

❌ Title keyword doesn't match content
✅ Content answers the promise in title

❌ Ignoring internal linking
✅ 3-5 contextual internal links per page

### Technical

❌ Missing schema markup
✅ Schema markup for all article/guide pages

❌ Slow page speed (>3s LCP)
✅ Optimized images, minified CSS/JS, <2.5s LCP

❌ Broken internal links
✅ Test and fix broken links monthly

❌ No canonical tags
✅ Docusaurus auto-adds; verify they're correct

---

## 11. Quick SEO Wins (Do First)

### Low Effort, High Impact (Do These Week 1)

1. **Add Meta Descriptions**
   - 5 minutes per page
   - Huge CTR impact

2. **Optimize Homepage**
   - Add schema markup
   - Improve value prop in first 50 words
   - Add CTA above fold

3. **Fix Broken Links**
   - Run crawler (Screaming Frog free tier)
   - Fix any 404s

4. **Improve Page Titles**
   - Include primary keyword
   - Aim for 50-60 characters
   - Make compelling

5. **Set Up Google Search Console**
   - Verify site
   - Submit sitemap
   - Check coverage

### Medium Effort, High Impact (Weeks 2-3)

6. **Create FAQ Page**
   - Answer 15 common questions
   - Add FAQ schema markup
   - Rank for question keywords

7. **Create Comparison Pages**
   - Doclea vs. Mem0
   - Doclea vs. DIY RAG
   - Commercial intent = conversions

8. **Optimize Core Web Vitals**
   - Image optimization
   - Lazy loading
   - CSS/JS minification
   - Target Lighthouse 90+

9. **Build Internal Linking**
   - Map out clusters
   - Add 3-5 contextual links per page
   - Use descriptive anchor text

10. **Create Blog Publish Template**
    - Standardize front matter
    - Ensure consistent quality
    - Speed up publishing

---

## 12. Tools Setup Checklist

### Free Tools (Setup Week 1)

- [ ] Google Search Console (verify ownership)
- [ ] Google Analytics 4 (set up tracking)
- [ ] Google PageSpeed Insights (monitor performance)
- [ ] Docusaurus sitemap plugin (enable)
- [ ] Google Lighthouse (run monthly)

### Optional Paid Tools (Month 2+)

- [ ] Ahrefs (keyword tracking, competitor analysis)
- [ ] SEMrush (same as Ahrefs, different features)
- [ ] Grammarly Business (team editing)
- [ ] ScreenFlow/Camtasia (create demo videos)

### Free Alternatives to Paid Tools

- **Keyword Research:** Ubersuggest free, Google Trends, AnswerThePublic
- **Rank Tracking:** Google Search Console (free but limited), MangoTools
- **Backlink Analysis:** Moz Link Explorer free tier
- **Content Analysis:** Hemingway Editor, Grammarly free

---

## 13. 90-Day Implementation Timeline

### Days 1-7: Setup Phase

- [ ] Optimize homepage (add schema, improve CTAs)
- [ ] Add meta descriptions to all existing pages
- [ ] Set up Google Search Console
- [ ] Set up Google Analytics 4
- [ ] Create blog publishing template
- [ ] Audit existing docs for SEO gaps

### Days 8-14: Content Creation Phase

- [ ] Publish blog post #1 (Problem + solution)
- [ ] Publish blog post #2 (Tutorial)
- [ ] Publish blog post #3 (Comparison)
- [ ] Create 2 new guide pages (memory, git)
- [ ] Create configuration page
- [ ] Create FAQ page

### Days 15-21: Authority Building

- [ ] Publish 3 more blog posts
- [ ] Create architecture pages
- [ ] Create comparison pages
- [ ] Optimize top pages for Core Web Vitals
- [ ] Build internal linking structure
- [ ] Outreach: GitHub PR mentions, Product Hunt

### Days 22-30: Momentum

- [ ] Publish 3 more blog posts
- [ ] Update and improve existing guides
- [ ] Analyze GSC data, optimize underperformers
- [ ] Expand keyword targeting based on early wins
- [ ] Community engagement (Dev.to, Reddit, GitHub Discussions)

### Days 31-60: Optimization Phase

- [ ] Analyze search traffic patterns
- [ ] Update content based on performance data
- [ ] Fill content gaps (new keywords)
- [ ] Create more advanced guides
- [ ] Build backlinks through outreach
- [ ] Monthly reporting and planning

### Days 61-90: Growth Phase

- [ ] Expand blog content calendar
- [ ] Create integrated guides/tutorials
- [ ] Build case studies
- [ ] Guest post opportunities
- [ ] Podcast/interview opportunities
- [ ] Plan quarter 2 content strategy

---

## Final Notes

**Success comes from:**
1. Consistent, high-quality content (most important)
2. Proper technical SEO (foundation)
3. Strategic internal linking (architecture)
4. Community engagement (authority)
5. Measurement & iteration (direction)

**Not from:**
- Keyword stuffing
- Link buying
- Duplicate content
- Cloaking or hidden text
- PBN (private blog networks)

Focus on **people first**, then optimize for search engines. Google rewards helpful, comprehensive content. Doclea's technical nature attracts readers who value depth and accuracy—lean into that.
