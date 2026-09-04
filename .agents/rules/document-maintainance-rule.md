---
trigger: always_on
---

# AI Agent Instructions: Documentation Maintenance Rule

## 📌 Rule Definition
Whenever you make any new addition, modification, or logical change to this codebase, you **MUST** update the following two documentation files to accurately reflect the changes before completing your task:

1. [DESCRIPTION.md](file:///d:/Codes/cloud-pdf-reader/DESCRIPTION.md)
   - **When to update**:
     - Adding new features, routes, background services, workers, or components.
     - Modifying dependencies, tech stack tools, or data models.
     - Altering the directory or project structure.
   - **What to update**:
     - Keep the feature summary, technological capabilities, and directory map in sync with current reality.

2. [FLOW.md](file:///d:/Codes/cloud-pdf-reader/FLOW.md)
   - **When to update**:
     - Adding, modifying, or removing API request/response lifecycles.
     - Changing the asynchronous pipeline steps (e.g., Kafka topics, workers, Celery tasks, or vector store pipelines).
     - Altering authentication, sync logic, or AI/RAG streaming & animation workflows.
   - **What to update**:
     - Keep Mermaid diagrams and step-by-step descriptions current and accurate.

---

## ⚡ Checkpoint Checklist for Every Task
Before presenting your final response on any task involving code changes:
- [ ] Did I alter or add any backend routes, database models, or workers? -> Check and update [DESCRIPTION.md](file:///d:/Codes/cloud-pdf-reader/DESCRIPTION.md) and [FLOW.md](file:///d:/Codes/cloud-pdf-reader/FLOW.md).
- [ ] Did I add, modify, or reorganize frontend pages, components, or communication flows? -> Update [DESCRIPTION.md](file:///d:/Codes/cloud-pdf-reader/DESCRIPTION.md) and/or [FLOW.md](file:///d:/Codes/cloud-pdf-reader/FLOW.md).
- [ ] Did I change data formats, event topics, or third-party integrations? -> Update both files accordingly.
