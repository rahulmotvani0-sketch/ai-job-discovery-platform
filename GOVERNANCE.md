# Project Governance

## Overview

This project is maintained as an open-source platform dedicated to high-privacy, user-controlled job discovery and application automation.

## Maintainer Model

1. **Maintainers**:
   - Maintainers hold write access to the repository, review contributions, and cut releases.
   - Maintainers are responsible for enforcing security policies, code review standards, and the Code of Conduct.
2. **Review Criteria**:
   - Every change must pass automated testing (`npm test`) and type checking (`npm run build`).
   - Security principles must be preserved: approval-gated submissions, constant-time token checks, strict SSRF defenses, zero secrets in logs.
   - Code must remain free of company-specific trademarks, personal file paths, or private credentials.

## Decision Making

- Technical direction is discussed transparently in GitHub Issues and Pull Requests.
- Security-sensitive decisions are vetted against principle of least privilege, privacy by design, and user consent.
