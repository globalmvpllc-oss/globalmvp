\# GLOBAL MVP — CLAUDE PROJECT CONTEXT



\## 1. PROJECT OVERVIEW



Global MVP is a SaaS application for small businesses and freelancers.



The product is intended to provide simple financial and bookkeeping functionality for small businesses.



Core areas include:



\- Dashboard

\- Customers

\- Vendors

\- Income

\- Expenses

\- Invoices

\- Payments

\- Reports

\- Calendar

\- Company settings

\- File uploads

\- PDF generation



The long-term goal is to turn this into a commercially usable global SaaS product.



\---



\# 2. CURRENT PROJECT LOCATION



The main application is located at:



&#x20;   nextjs\_space/



Do not assume the repository root is the Next.js application root.



The actual application source is:



&#x20;   nextjs\_space/



\---



\# 3. CURRENT STACK



The current application is based on:



\- Next.js

\- React

\- TypeScript

\- Tailwind CSS

\- Prisma

\- NextAuth/authentication infrastructure

\- PostgreSQL-compatible database architecture

\- AWS/S3-related file storage infrastructure

\- Vitest for testing



Always verify the exact versions from:



&#x20;   nextjs\_space/package.json



Do not rely on this document for version numbers.



\---



\# 4. IMPORTANT DIRECTORIES



Application:



&#x20;   nextjs\_space/app/



Reusable components:



&#x20;   nextjs\_space/components/



Hooks:



&#x20;   nextjs\_space/hooks/



Shared libraries:



&#x20;   nextjs\_space/lib/



Database schema:



&#x20;   nextjs\_space/prisma/schema.prisma



Public assets:



&#x20;   nextjs\_space/public/



Scripts:



&#x20;   nextjs\_space/scripts/



Tests:



&#x20;   nextjs\_space/tests/



Types:



&#x20;   nextjs\_space/types/



Configuration:



&#x20;   nextjs\_space/package.json

&#x20;   nextjs\_space/next.config.js

&#x20;   nextjs\_space/middleware.ts

&#x20;   nextjs\_space/tsconfig.json

&#x20;   nextjs\_space/tailwind.config.ts



\---



\# 5. CURRENT FEATURE AREAS



The current repository contains implementation for:



\- Authentication

\- Signup

\- Login

\- Onboarding

\- Dashboard

\- Customers

\- Customer details

\- Vendors

\- Income

\- Expenses

\- Invoices

\- Invoice details

\- Invoice creation

\- Payments

\- Reports

\- Calendar

\- Settings

\- Categories

\- PDF generation

\- File uploads



IMPORTANT:



The existence of a page or API route does NOT automatically mean the feature is fully implemented.



Before declaring something complete, verify:



1\. UI

2\. API

3\. Database

4\. Authentication

5\. Authorization

6\. Validation

7\. Error handling



\---



\# 6. SECURITY RULES



Never expose or commit secrets.



NEVER read, print, copy or commit:



\- API keys

\- Passwords

\- Database credentials

\- Session secrets

\- AWS credentials

\- Supabase credentials

\- Production environment variables



The following files must remain local:



&#x20;   .env

&#x20;   .env.\*

&#x20;   

unless they are explicitly example files such as:



&#x20;   .env.example



Never put real secrets into CLAUDE.md.



\---



\# 7. MULTI-TENANCY



This application is intended to support multiple users/businesses.



Every data-access operation must be evaluated for tenant/company isolation.



Critical data includes:



\- Customers

\- Vendors

\- Invoices

\- Invoice items

\- Payments

\- Income

\- Expenses

\- Categories

\- Company information

\- Uploaded files



Never assume that hiding something in the UI provides security.



Authorization must be enforced server-side.



Always check whether the current authenticated user is authorized to access the requested record.



\---



\# 8. API RULES



API routes are located under:



&#x20;   nextjs\_space/app/api/



When modifying an API route:



1\. Verify authentication.

2\. Verify authorization.

3\. Validate all input.

4\. Verify tenant/company ownership.

5\. Use safe database queries.

6\. Return appropriate HTTP status codes.

7\. Handle errors safely.

8\. Never expose secrets or sensitive database information.



\---



\# 9. DATABASE RULES



Database schema:



&#x20;   nextjs\_space/prisma/schema.prisma



Before changing the database:



1\. Understand existing models.

2\. Check existing relationships.

3\. Check whether existing data could be affected.

4\. Avoid destructive migrations.

5\. Avoid unnecessary schema duplication.

6\. Preserve existing functionality.



Never make destructive database changes without explicit approval.



\---



\# 10. UI / UX RULES



Maintain the existing visual system unless a redesign is explicitly requested.



Important:



\- Do not randomly redesign working pages.

\- Reuse existing components.

\- Reuse existing UI primitives.

\- Maintain responsive behavior.

\- Maintain loading states.

\- Maintain empty states.

\- Maintain error states.

\- Maintain accessibility.

\- Keep the application visually consistent.



Before creating a new component, check whether an existing component can be reused.



\---



\# 11. EXISTING UI SYSTEM



Reusable UI components are primarily located in:



&#x20;   nextjs\_space/components/ui/



Also inspect:



&#x20;   nextjs\_space/STYLE\_GUIDE.md



before making significant UI changes.



Follow the existing design language.



\---



\# 12. TESTING



Tests are located in:



&#x20;   nextjs\_space/tests/



Current testing infrastructure includes:



\- Unit tests

\- Integration/regression tests

\- Vitest



Before considering a feature complete:



1\. Run relevant tests.

2\. Check TypeScript/build errors where appropriate.

3\. Do not delete or weaken existing tests simply to make them pass.



\---



\# 13. DEVELOPMENT WORKFLOW



Follow this workflow for development tasks:



\## Step 1 — Understand



Read:



&#x20;   CLAUDE.md

&#x20;   nextjs\_space/STYLE\_GUIDE.md

&#x20;   nextjs\_space/package.json



Then inspect only the files relevant to the requested task.



Do NOT scan the entire repository unnecessarily.



\## Step 2 — Plan



Before making significant changes:



\- Identify affected files.

\- Identify API impact.

\- Identify database impact.

\- Identify authentication/security impact.

\- Identify UI impact.

\- Identify testing requirements.



\## Step 3 — Implement



Make the smallest safe change necessary.



Do not rewrite working systems unnecessarily.



\## Step 4 — Verify



Run appropriate:



\- Tests

\- Type checks

\- Build checks



depending on the change.



\## Step 5 — Report



Clearly state:



\- What changed

\- Which files changed

\- What was tested

\- Any remaining issues



\---



\# 14. IMPORTANT CHANGE POLICY



Do NOT modify unrelated functionality.



If a requested feature can be implemented without changing an existing subsystem, do not change that subsystem.



Avoid large refactors unless explicitly requested.



Prefer:



&#x20;   small change

&#x20;   → verify

&#x20;   → continue



rather than:



&#x20;   rewrite

&#x20;   → hope everything still works



\---



\# 15. PHASED DEVELOPMENT



The project is being developed in phases.



Current objective:



Complete the existing MVP safely before adding large new features.



Phase 2 should focus on:



\- Completing unfinished core functionality

\- Fixing security issues

\- Fixing data/tenant isolation

\- Completing missing API functionality

\- Improving validation

\- Improving error handling

\- Completing invoice/payment workflows

\- Improving reports/dashboard accuracy

\- Production readiness



Do not implement Phase 2 merely from assumptions.



Use the repository and the latest approved project plan as the source of truth.



\---



\# 16. SOURCE OF TRUTH



Priority order:



1\. Actual source code

2\. Database schema

3\. Tests

4\. Approved project requirements

5\. CLAUDE.md

6\. Comments/documentation



If CLAUDE.md conflicts with the actual code, investigate and report the discrepancy.



Do not blindly trust documentation.



\---



\# 17. AUDIT MODE



When asked to audit the project:



\- Do not modify files.

\- Do not fix issues automatically.

\- Do not install unnecessary dependencies.

\- Do not deploy.

\- Do not change database state.



Instead provide:



\- Verified findings

\- Unverified findings

\- Security findings

\- Missing functionality

\- Broken functionality

\- Recommended priorities



\---



\# 18. IMPLEMENTATION MODE



When explicitly authorized to implement a task:



\- Read CLAUDE.md first.

\- Inspect only relevant files.

\- Preserve working functionality.

\- Make minimal changes.

\- Test the change.

\- Report changed files and verification results.



Do not start unrelated improvements.



\---



\# 19. GIT SAFETY



Never:



\- force push

\- delete branches

\- rewrite Git history

\- remove unrelated commits

\- reset the repository destructively



without explicit user approval.



Before major changes, ensure the working tree state is understood.



\---



\# 20. CURRENT HANDOFF STATUS



The project was previously developed using Abacus AI.



Abacus compute credits were exhausted before the planned next development phase could be completed.



The current repository was recovered from the Abacus project workspace and committed to GitHub.



GitHub repository:



&#x20;   https://github.com/globalmvpllc-oss/globalmvp



The current main branch contains the recovered Abacus MVP code.



The next development stage is:



&#x20;   ABACUS HANDOFF → AUDIT → PHASE 2



The project must first be audited to determine exactly what Abacus completed and what remains unfinished.



Do not assume that all existing features are production-ready.



\---



\# 21. CLAUDE OPERATING PRINCIPLE



DO NOT repeatedly scan the entire repository for every task.



Use this document as the project context.



For each task:



1\. Read CLAUDE.md.

2\. Identify relevant files.

3\. Inspect only those files.

4\. Trace dependencies only when necessary.

5\. Make minimal changes.

6\. Verify the result.



Perform a full repository audit only when explicitly requested.



\---



\# END OF CLAUDE PROJECT CONTEXT

