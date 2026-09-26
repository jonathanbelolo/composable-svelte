# Checker release decision — 2026-09-26

The user explicitly requested immediate npm publication and withdrawal of checker recommendations. The checker is completely optional, its use is discouraged, and its practical effectiveness is not established. A clean result is not architectural approval. It is not an application acceptance or release requirement.

Core starter no longer installs the checker or includes a checker script. Shipped Core README, consumer README/AGENTS, consumer guide and application contract carry the warning. Architecture README carries the same warning, including that implementation tests do not establish practical reliability.

The final bounded analyzer implementation passed its scoped review and checks before this decision. Those historical receipts remain evidence of specific executions, not a reliability claim or certification. Final publication archives replace only documentation and starter dependency/command configuration; runtime code is unchanged.
