For every completed change that is missing specifications:

1. Review all completed changes under:

   ```text
   openspec/changes/
   ```

2. For each completed change:

   * Check whether:

     ```text
     openspec/changes/<change-id>/spec.md
     ```

     exists.

3. If `spec.md` does not exist:

   * Create:

     ```text
     openspec/changes/<change-id>/spec.md
     ```
   * Include:

     * Requirements
     * Acceptance Criteria
     * Affected Capabilities
     * Functional Behavior
     * Dependencies

4. If `spec.md` already exists:

   * Do not automatically skip.
   * Present the ticket and existing spec path.
   * Ask whether to:

     * Skip the ticket,
     * Review and update the spec,
     * Regenerate the spec from the implemented code.

5. Generate a separate `spec.md` for each change.
   Do not combine multiple tickets into a single specification file.

6. At the end, provide a summary:

   * Tickets processed
   * Specs created
   * Specs already present
   * Tickets awaiting user decision
