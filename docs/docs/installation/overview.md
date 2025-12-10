---
sidebar_position: 1
title: Installation Overview
description: Choose the right installation method for your needs.
---

# Installation Overview

Choose the installation method that fits your needs.

## Quick Comparison

| Method | Best For | Setup Time |
|--------|----------|------------|
| [Zero-Config](./zero-config) | Getting started, small projects | 30 seconds |
| [Docker](./docker) | Large codebases, teams | 5 minutes |

## Decision Guide

```mermaid
graph TD
    A[Start] --> B{Project size?}
    B -->|< 10k files| C[Zero-Config]
    B -->|> 10k files| D{Team size?}
    D -->|Solo| C
    D -->|Team| E[Docker]
```

## Next Steps

- [Zero-Config Setup](./zero-config) - Start here
- [Docker Setup](./docker) - For production workloads
- [Verification](./verification) - Test your installation
