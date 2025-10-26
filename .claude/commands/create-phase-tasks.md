---
description: Create detailed task breakdown for a new phase
---

You are helping to create a detailed task breakdown document for a phase of the Composable Svelte library implementation.

## Context

This project follows a specification-first approach where:
- **Specs** (`specs/frontend/*.md`) are the source of truth for WHAT and HOW to implement
- **Implementation plan** (`plans/implementation-plan.md`) defines the overall strategy and phases
- **Phase task documents** (`plans/phase-N-tasks.md`) provide detailed natural language task breakdowns

## Your Task

Create a detailed phase task breakdown document following the format established in `plans/phase-1-tasks.md`.

## Important Guidelines

### DO:
- Write clear natural language descriptions of what needs to be accomplished
- Include "What to do" bullet points that describe outcomes and goals
- Reference relevant spec sections for implementation details
- Provide clear acceptance criteria focused on outcomes
- Include time estimates for planning
- Document important design decisions and considerations
- List file paths that will be created
- Note dependencies between tasks
- Keep appropriate granularity (not too detailed, not too vague)

### DO NOT:
- Include detailed code implementations or examples
- Pre-write TypeScript function bodies
- Include complete test files
- Create a "third source of truth" that conflicts with specs
- Lock in implementation details prematurely
- Make the tasks feel like "pre-implementation"

## Format Structure

Each task should have:

```markdown
### Task X.Y.Z: [Task Name]
**Estimated Time**: [hours]
**Dependencies**: [Task references or "None"]
**File**: [file path if applicable]

**Description**:
[1-2 sentences describing the goal and purpose of this task]

**What to do**:
- [Outcome-focused bullet point]
- [What needs to be achieved]
- [Key considerations]

**Important**: [Optional section for critical design decisions]

**Spec Reference**: [Reference to relevant spec section]

**Acceptance Criteria**:
- [ ] [Outcome-based criterion]
- [ ] [What "done" looks like]
- [ ] [Verification method]
```

## Process

1. Ask the user which phase they want to create tasks for (if not already specified)
2. Review the implementation plan to understand the phase scope
3. Review relevant specs to understand what needs to be implemented
4. Create task breakdown with appropriate granularity
5. Ensure tasks are sequenced logically with clear dependencies
6. Provide time estimates and critical path analysis

## Output

Create a markdown file at `plans/phase-N-tasks.md` with:
- Phase overview (duration, deliverable, spec references)
- Detailed task breakdown organized by major sections
- Summary with total time estimate and critical path
- Key principles for implementation

Ready to create phase tasks! Please specify which phase you want to break down, or I'll ask you which one.
