Run OpenSpec proposal creation for: $ARGUMENTS

Steps:
1.Run: openspec changes list
2.Read: Review existing changes under:
        openspec/changes/
        Check for related or dependent changes.
        Review any existing proposal.md and spec.md files.
3.Read: docs/FRS.md → find relevant requirements for this ticket
4.Read: docs/SDS.md → find relevant design decisions for this ticket
5.Read: AGENTS.md (constraints)
6.Ask clarifying questions — minimum 3, maximum 8
7.Run: openspec proposal $ARGUMENTS
8.Show generated proposal.md and spec delta
9.Do NOT proceed to implementation

Format: /spec AB-1042-user-registration