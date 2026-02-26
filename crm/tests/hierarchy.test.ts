/**
 * Hierarchy Tests
 *
 * TODO: Test hierarchy helper functions.
 * - Create test hierarchy (VP → Director → Manager → AE)
 * - Test isManagerOf, isDirectorOf, isVp
 * - Test getDirectReports, getSubtree
 * - Test hasAccessTo for each role level
 * - Test edge cases (orphaned records, inactive people)
 */

import { describe, it, expect } from 'vitest';

describe('Hierarchy', () => {
  it.todo('isManagerOf returns true for direct reports');
  it.todo('isManagerOf returns false for non-reports');
  it.todo('isDirectorOf returns true for two-level reports');
  it.todo('isVp identifies VP role');
  it.todo('getDirectReports returns immediate children');
  it.todo('getSubtree returns full tree recursively');
  it.todo('hasAccessTo enforces role-based access');
  it.todo('hasAccessTo allows self-access for all roles');
});
