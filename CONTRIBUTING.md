# Contributing to JOB DISCOVERY AI - Autonomous Platform

Thank you for your interest in contributing to **JOB DISCOVERY AI - Autonomous Platform**! This project is built for **all IT and tech job seekers** to democratize and automate intelligent job discovery while keeping data private and local.

---

## 🧭 Code of Conduct & Privacy Principles

1. **Zero Data Leak**: Never hardcode personal emails, phone numbers, real candidate names, or API credentials into source code, test suites, or documentation.
2. **Local-First & User Controlled**: All candidate data, resumes, and application credentials must reside on the user's local machine unless explicitly authorized by the user.
3. **Deterministic & Test-Driven**: New features must include automated tests in `tests/` with high assertion coverage.

---

## 🛠️ Development Setup

1. **Prerequisites**:
   - Node.js v22 or higher (with native `node:sqlite` support)
   - npm v10 or higher
   - (Optional) [Ollama](https://ollama.ai) for local CPU/GPU AI inference

2. **Clone and Install**:
   ```bash
   git clone https://github.com/rahulmotvani0-sketch/ai-job-discovery-platform.git
   cd ai-job-discovery-platform
   npm install
   ```

3. **Run Test Suite**:
   ```bash
   npm test
   ```

4. **Start the Local Development Server**:
   ```bash
   npm run dev   # or npm start
   ```

---

## 🔌 Adding a New ATS / Job Source Connector

We welcome connectors for major ATS platforms (e.g., Workable, SmartRecruiters, BambooHR, Rippling, Jobvite, Taleo).

### 1. Implement the `IJobSourceConnector` Interface

Create your connector in `src/discovery/connectors/<connector-name>.ts`:

```typescript
import type { IJobSourceConnector } from './types.js';
import type { RawJobPayload } from '../../types/index.js';

export class WorkableAtsConnector implements IJobSourceConnector {
  readonly name = 'Workable ATS';
  readonly sourceType = 'workable';

  async fetchVacancies(options?: { tags?: string[]; limit?: number }): Promise<RawJobPayload[]> {
    // 1. Fetch public vacancies from the target company boards
    // 2. Map payloads into RawJobPayload format
    // 3. Return array of collected vacancies
  }
}
```

### 2. Register in `src/discovery/connectors/manager.ts`

Add your connector to the default connectors array in `DiscoveryManager`:

```typescript
import { WorkableAtsConnector } from './workable.js';

// In DiscoveryManager constructor:
this.connectors = customConnectors || [
  new RemoteOkConnector(),
  new JobicyConnector(),
  new GreenhouseAtsConnector(),
  new HimalayasConnector(),
  new LeverAtsConnector(),
  new AshbyAtsConnector(),
  new WorkableAtsConnector(),
];
```

### 3. Add Automated Tests

Add test cases in `tests/discovery.test.ts` verifying parsing, payload normalization, error handling, and deduplication.

---

## 🧪 Testing Guidelines

- Run `npm test` before submitting changes.
- Ensure all 8 test suites pass with 100% success.
- If introducing new routes or agents, add corresponding unit and integration tests.

---

## 📬 Submitting a Pull Request (PR)

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/add-workable-connector
   ```
2. Commit your changes with descriptive, conventional commit messages:
   ```bash
   git commit -m "feat(connectors): add Workable ATS discovery connector"
   ```
3. Push to your fork:
   ```bash
   git push origin feat/add-workable-connector
   ```
4. Open a Pull Request on GitHub against `main`. Provide a concise summary of the additions and confirm that `npm test` passes.

---

## 📄 License

By contributing to this repository, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
