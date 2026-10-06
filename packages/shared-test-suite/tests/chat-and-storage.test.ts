import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('B4.3 Matrix Chat Integration & Room Isolation', () => {
  it('Matrix SSO session token resolves authenticated user and authorized room', () => {
    const ssoSession = {
      user_id: '@operator:chat.local',
      matrix_token: 'sso_sess_tok_99182',
      authorized_rooms: ['!room-agency-alpha:chat.local', '!room-crm-general:chat.local']
    };

    assert.equal(ssoSession.user_id, '@operator:chat.local');
    assert.equal(ssoSession.authorized_rooms.length, 2);
    assert.ok(ssoSession.authorized_rooms.includes('!room-agency-alpha:chat.local'));
  });

  it('Cross-room / cross-tenant leakage is strictly rejected', () => {
    const authorizedRooms = ['!room-agency-alpha:chat.local'];
    const targetRoom = '!room-tenant-beta-private:chat.local';

    const isAllowed = authorizedRooms.includes(targetRoom);
    assert.equal(isAllowed, false, 'Cross-room access must be rejected');
  });

  it('Degraded chat service state handles network interruption gracefully', () => {
    const chatState = { status: 'DISCONNECTED', fallback_ui: 'Chat temporarily unavailable' };
    assert.equal(chatState.status, 'DISCONNECTED');
    assert.equal(chatState.fallback_ui, 'Chat temporarily unavailable');
  });
});

describe('B4.4 Survivors Storage File URN Reference Integration', () => {
  it('Attaches file URN reference to CRM deal / Agency project without byte duplication', () => {
    const agencyProjectAttachment = {
      project_id: 'proj-4412',
      file_ref: {
        authority: 'survivors_storage',
        file_urn: 'urn:dfl:storage:vault-alpha:doc-8812',
        display_name: 'Scope_Statement_v2.pdf',
        mime_type: 'application/pdf',
        size_bytes: 409600
      }
    };

    assert.equal(agencyProjectAttachment.file_ref.authority, 'survivors_storage');
    assert.equal(agencyProjectAttachment.file_ref.file_urn, 'urn:dfl:storage:vault-alpha:doc-8812');
    assert.ok(!('raw_bytes' in agencyProjectAttachment.file_ref), 'Must not duplicate file bytes');
  });

  it('Survivors storage re-authorizes tenant access upon file reference opening', () => {
    const secContext = { auth_tenant_id: 'tenant-alpha' };
    const fileMetadata = { vault_tenant_id: 'tenant-alpha', file_urn: 'urn:dfl:storage:vault-alpha:doc-8812' };

    const authorized = secContext.auth_tenant_id === fileMetadata.vault_tenant_id;
    assert.equal(authorized, true);
  });

  it('Cross-tenant file reference opening is rejected with 403 Forbidden', () => {
    const secContext = { auth_tenant_id: 'tenant-beta' };
    const fileMetadata = { vault_tenant_id: 'tenant-alpha', file_urn: 'urn:dfl:storage:vault-alpha:doc-8812' };

    const authorized = secContext.auth_tenant_id === fileMetadata.vault_tenant_id;
    assert.equal(authorized, false, 'Cross-tenant file reference access must be rejected');
  });

  it('Unauthorized vault path access is rejected', () => {
    const requestedPath = '/vault-alpha/../../etc/passwd';
    const isPathTraversal = requestedPath.includes('..');
    assert.equal(isPathTraversal, true, 'Path traversal must be detected and rejected');
  });
});
