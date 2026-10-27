# Security Policy

## Reporting a Vulnerability

We take the security of this platform seriously. If you discover a security vulnerability, please do **not** open a public issue. Instead, report it responsibly through coordinated vulnerability disclosure:

- **Security Team Email**: security@example.com (or via private GitHub Vulnerability Reporting)
- **Response Target**: We acknowledge reports within **48 hours** and provide a patch/remediation timeline within **7 business days**.

Please provide:
1. Detailed description of the vulnerability and attack vector.
2. Steps to reproduce or proof-of-concept payload.
3. Affected components, endpoints, or environment conditions.
4. Any potential mitigations or suggested fixes.

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

---

## Security Architecture & Defenses

1. **Strict Approval Gate**:
   - Applications, tailored resumes, and recruiter response emails can **never** be transmitted automatically without explicit user authorization via `/api/drafts/:id/approve-and-send`.
2. **SSRF Protections**:
   - Outbound connector requests reject RFC 1918 private IPv4 addresses, loopback variants (`127.0.0.1`, `::1`), link-local (`169.254.0.0/16`, `fe80::`), unique local IPv6, IPv4-mapped IPv6, decimal/hex IP representations, cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), and internal network TLDs (`.local`, `.internal`, `.lan`, `.corp`).
3. **Constant-Time Secret Comparison**:
   - All API keys and authentication tokens are verified using `crypto.timingSafeEqual` with SHA-256 fixed-length digests to neutralize timing attacks.
4. **Data Redaction & Zero Secret Logging**:
   - The platform logger deeply scrubs sensitive keys (`password`, `secret`, `token`, `apiKey`, `refreshToken`, `accessToken`, `resumeText`, `rawResume`, `emailBody`) and regex-matches tokens to prevent secret leakage in log files or console streams.
5. **Fail-Closed Configuration**:
   - In production mode (`NODE_ENV=production`), the application strictly refuses to start if `API_AUTH_TOKEN` is missing or shorter than 32 characters, if wildcard CORS is specified, or if enabled cloud providers lack credentials.
6. **Isolated Persistence**:
   - SQLite databases and token storage files are created with restricted file permissions (`0o600`), enforcing user-level isolation.
