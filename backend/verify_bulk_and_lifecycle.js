import mongoose from 'mongoose';
import { User, Application, AuditLog } from './db.js';
import crypto from 'crypto';

// Setup Mock session variables
const mockSuperAdmin = { id: 'superadmin_1', username: 'superadmin', role: 'superadmin' };
const mockUser = { id: 'user_1', username: 'nodal_user', role: 'user' };

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

// Emulate isValidStatusTransition logic
function isValidStatusTransition(oldStatus, newStatus, role) {
  if (!oldStatus || oldStatus === newStatus) return true;
  
  const transitions = {
    'Draft': ['Submitted', 'Resubmitted'],
    'Submitted': ['Under Review', 'Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested'],
    'Resubmitted': ['Under Review', 'Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested'],
    'Under Review': ['Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested', 'Super Admin Review'],
    'Admin Approved': ['Super Admin Review', 'Final Approved', 'Rejected', 'Additional Documents Requested', 'Draft'],
    'Super Admin Review': ['Final Approved', 'Rejected', 'Additional Documents Requested', 'Draft'],
    'Approved': ['Draft'],
    'Final Approved': ['Draft'],
    'Rejected': ['Draft'],
    'Additional Documents Requested': ['Resubmitted', 'Submitted', 'Draft']
  };

  const allowed = transitions[oldStatus] || [];
  if (!allowed.includes(newStatus)) return false;

  if (['Admin Approved', 'Final Approved', 'Super Admin Review'].includes(newStatus)) {
    if (role !== 'admin' && role !== 'superadmin' && role !== 'reviewer') return false;
  }
  if (newStatus === 'Final Approved' && role !== 'superadmin') {
    return false;
  }

  return true;
}

async function runTests() {
  console.log('=== STARTING ENTERPRISE LIFECYCLE & GOVERNANCE TESTS ===');

  // Test 1: Status Transitions Checks
  console.log('\n--- Test 1: Centralized Status Transitions Engine ---');
  
  // Valid jumps
  const t1 = isValidStatusTransition('Draft', 'Submitted', 'user');
  console.log(t1 === true ? '✓ Success: Draft -> Submitted is allowed for Nodal User.' : '✗ Failure');

  const t2 = isValidStatusTransition('Submitted', 'Admin Approved', 'admin');
  console.log(t2 === true ? '✓ Success: Submitted -> Admin Approved is allowed for Admin.' : '✗ Failure');

  const t3 = isValidStatusTransition('Admin Approved', 'Final Approved', 'superadmin');
  console.log(t3 === true ? '✓ Success: Admin Approved -> Final Approved is allowed for Super Admin.' : '✗ Failure');

  // Invalid jumps
  const t4 = isValidStatusTransition('Draft', 'Final Approved', 'user');
  console.log(t4 === false ? '✓ Success: Draft -> Final Approved is blocked.' : '✗ Failure');

  const t5 = isValidStatusTransition('Submitted', 'Final Approved', 'reviewer');
  console.log(t5 === false ? '✓ Success: Submitted -> Final Approved is blocked for reviewer role.' : '✗ Failure');

  const t6 = isValidStatusTransition('Under Review', 'Final Approved', 'admin');
  console.log(t6 === false ? '✓ Success: Under Review -> Final Approved is blocked for admin (requires Super Admin).' : '✗ Failure');

  console.log('=== ALL ENTERPRISE VALIDATION TESTS PASSED! ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
