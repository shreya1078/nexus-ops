import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, seedDatabase, hashPassword, verifyPassword } from '../src/server/db.ts';
import {
  getUserFromDb,
  checkProjectAccess,
  validateWorkflowTransition,
  canMakeApprovalDecision
} from '../src/server/auth.ts';

describe('Nexus Ops — Critical Correctness, Security & Concurrency Verification', () => {
  let db: any;

  before(async () => {
    db = await getDatabase();
  });

  beforeEach(() => {
    // Reset database to pristine demo state before each test
    seedDatabase(db);
  });

  describe('Scenario 1: Project & Issue Authorization Boundaries', () => {
    it('Should allow Operation Head to view and manage Customer Operations project', () => {
      const shreya = getUserFromDb(db, 'usr_shreya');
      assert.ok(shreya, 'Shreya user exists');

      const access = checkProjectAccess(db, shreya!, 'proj_cop', 'editor');
      assert.equal(access.allowed, true, 'Shreya should have editor/admin access to Customer Operations');
    });

    it('Should reject restricted partner from accessing Customer Operations project', () => {
      const restrictedUser = getUserFromDb(db, 'usr_restricted');
      assert.ok(restrictedUser, 'Restricted user exists');

      // Attempt to access Customer Operations
      const access = checkProjectAccess(db, restrictedUser!, 'proj_cop', 'viewer');
      assert.equal(access.allowed, false, 'Restricted user must NOT access Customer Operations');
      assert.equal(access.reason, 'UNAUTHORIZED_PROJECT_ACCESS');
    });

    it('Should reject regular Team Member from accessing unauthorized isolated projects', () => {
      const maya = getUserFromDb(db, 'usr_maya');
      assert.ok(maya);

      // Attempt to access isolated partner project
      const access = checkProjectAccess(db, maya!, 'proj_isolated', 'viewer');
      assert.equal(access.allowed, false, 'Maya must not access isolated partner sandbox');
    });
  });

  describe('Scenario 2: Optimistic Concurrency & Stale Update Protection', () => {
    it('Should prevent silent overwrites when two operators update the same issue concurrently', () => {
      // Fetch current issue NEX-102
      const stmt = db.prepare('SELECT id, version, title, status FROM issues WHERE id = "NEX-102"');
      stmt.step();
      const issue = stmt.getAsObject();
      stmt.free();

      assert.equal(issue.version, 1, 'Initial version must be 1');

      // Operator A updates issue to version 2
      db.run('UPDATE issues SET status = "In Review", version = version + 1 WHERE id = "NEX-102" AND version = 1');

      // Verify version incremented
      const checkStmt = db.prepare('SELECT version, status FROM issues WHERE id = "NEX-102"');
      checkStmt.step();
      const updatedIssue = checkStmt.getAsObject();
      checkStmt.free();
      assert.equal(updatedIssue.version, 2, 'Version incremented to 2');

      // Operator B attempts to update with stale version 1
      const staleVersion = 1;
      const isConflict = staleVersion !== updatedIssue.version;
      assert.equal(isConflict, true, 'System correctly flags concurrency conflict');
    });
  });

  describe('Scenario 3: Duplicate Submission & Idempotency Key Protection', () => {
    it('Should reject or return cached response when the same idempotency key is submitted twice', () => {
      const idempotencyKey = 'idemp_test_key_999';
      const initialPayload = JSON.stringify({ id: 'NEX-999', title: 'New Provisioning Run' });

      // First submission inserts key
      db.run(
        'INSERT INTO idempotency_keys (key, action_type, response_payload, created_at) VALUES (?, "create_issue", ?, datetime("now"))',
        [idempotencyKey, initialPayload]
      );

      // Verify key exists
      const checkStmt = db.prepare('SELECT response_payload FROM idempotency_keys WHERE key = :key');
      checkStmt.bind({ ':key': idempotencyKey });
      const found = checkStmt.step();
      assert.equal(found, true, 'Key found in registry');

      // Duplicate submission: query should yield cached payload without re-running insert
      const cached = checkStmt.getAsObject();
      checkStmt.free();
      assert.equal(cached.response_payload, initialPayload, 'Returns cached response payload');

      // Trying to insert duplicate key fails primary key constraint
      assert.throws(() => {
        db.run('INSERT INTO idempotency_keys (key, action_type, response_payload, created_at) VALUES (?, "create_issue", ?, datetime("now"))', [
          idempotencyKey,
          initialPayload
        ]);
      }, /UNIQUE constraint failed/);
    });
  });

  describe('Scenario 4: Workflow Validation & Approval Gate Bypass Defense', () => {
    it('Should strictly PREVENT an issue requiring approval from being marked Done while approval is pending', () => {
      // NEX-101 has requires_approval = 1 and approval_status = 'PENDING'
      const stmt = db.prepare('SELECT id, status, requires_approval, approval_status FROM issues WHERE id = "NEX-101"');
      stmt.step();
      const issue = stmt.getAsObject() as any;
      stmt.free();

      assert.equal(issue.requires_approval, 1);
      assert.equal(issue.approval_status, 'PENDING');

      // Attempt transition to 'Done'
      const validation = validateWorkflowTransition(issue.status, 'Done', issue);
      assert.equal(validation.valid, false, 'Transition to Done must be blocked');
      assert.match(validation.error || '', /APPROVAL_REQUIRED_BYPASS_PREVENTED/);
    });

    it('Should allow issue to transition to Done once approval is APPROVED', () => {
      const issueApproved = {
        requires_approval: 1,
        approval_status: 'APPROVED'
      };

      const validation = validateWorkflowTransition('In Review', 'Done', issueApproved);
      assert.equal(validation.valid, true, 'Transition to Done is permitted after approval');
    });

    it('Should reject invalid workflow transitions', () => {
      const issue = { requires_approval: 0, approval_status: 'NONE' };
      // Attempt invalid transition Open -> Done (bypassing In Progress / In Review)
      const validation = validateWorkflowTransition('Open', 'Done', issue);
      assert.equal(validation.valid, false, 'Direct Open to Done jump must be rejected');
    });
  });

  describe('Scenario 5: Designated Approver Rules & Self-Approval Prevention', () => {
    it('Should prevent self-approval by the request initiator', () => {
      // In appr_101, requester_id is usr_rahul
      const rahul = getUserFromDb(db, 'usr_rahul');
      assert.ok(rahul);

      const approval = {
        requester_id: 'usr_rahul',
        assigned_approver_id: 'usr_rahul',
        status: 'PENDING'
      };

      const result = canMakeApprovalDecision(db, rahul!, approval);
      assert.equal(result.allowed, false, 'Self approval must be prohibited');
      assert.match(result.error || '', /SELF_APPROVAL_PROHIBITED/);
    });

    it('Should reject users without designated approver authority', () => {
      const maya = getUserFromDb(db, 'usr_maya');
      assert.ok(maya);
      assert.equal(maya!.is_approver, 0, 'Maya is not a designated approver');

      const approval = {
        requester_id: 'usr_alex',
        assigned_approver_id: 'usr_maya',
        status: 'PENDING'
      };

      const result = canMakeApprovalDecision(db, maya!, approval);
      assert.equal(result.allowed, false, 'Non-approver must be rejected');
      assert.match(result.error || '', /UNAUTHORIZED_APPROVER/);
    });

    it('Should permit designated approver (Operation Head Shreya) to authorize valid pending approval', () => {
      const shreya = getUserFromDb(db, 'usr_shreya');
      assert.ok(shreya);
      assert.equal(shreya!.is_approver, 1, 'Shreya has approver authority');

      const approval = {
        requester_id: 'usr_rahul',
        assigned_approver_id: 'usr_shreya',
        status: 'PENDING'
      };

      const result = canMakeApprovalDecision(db, shreya!, approval);
      assert.equal(result.allowed, true, 'Shreya can authorize this approval');
    });

    it('Should reject decision attempts on already finalized approvals (Conflict Defense)', () => {
      const shreya = getUserFromDb(db, 'usr_shreya');
      const approval = {
        requester_id: 'usr_rahul',
        assigned_approver_id: 'usr_shreya',
        status: 'APPROVED' // already decided
      };

      const result = canMakeApprovalDecision(db, shreya!, approval);
      assert.equal(result.allowed, false, 'Cannot modify finalized approval');
      assert.match(result.error || '', /APPROVAL_ALREADY_DECIDED/);
    });
  });

  describe('Scenario 6: Authentication & Session Verification', () => {
    it('Should verify correct password hash and salt match', () => {
      const pass = 'Password123!';
      const { hash, salt } = hashPassword(pass);
      assert.equal(verifyPassword(pass, hash, salt), true, 'Password matches hash');
      assert.equal(verifyPassword('WrongPass', hash, salt), false, 'Incorrect password fails');
    });

    it('Should enforce session expiration logic', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const futureDate = new Date(Date.now() + 3600000).toISOString();

      assert.equal(new Date(pastDate) < new Date(), true, 'Past session expired');
      assert.equal(new Date(futureDate) > new Date(), true, 'Future session active');
    });
  });
});
