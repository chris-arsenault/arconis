/** HTTP metadata only. Saved canvas contents and account/runtime implementations stay separate. */
export interface AccountProfile {
  name: string;
  bytes: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  roomId: string;
  size: number;
  revision: string;
  updated: number;
}

export type UpdateProfileRequest = Pick<AccountProfile, "name">;
export interface SaveWorkspaceRequest {
  size: number;
  checksum: string;
  name: string;
  roomId: string;
}
export type AccountRequestBody = UpdateProfileRequest | SaveWorkspaceRequest;

export interface WorkspaceUploadReply {
  url: string;
  revision: string;
}
export interface WorkspaceDownloadReply extends WorkspaceRecord {
  url: string;
}
export interface WorkspaceListReply {
  workspaces: WorkspaceRecord[];
}
export type EmptyReply = Record<string, never>;
export interface AccountError {
  error: string;
}

/** Each endpoint checks its own successful construction, including the two empty replies. */
export interface AccountReplies {
  getProfile: AccountProfile;
  updateProfile: UpdateProfileRequest;
  deleteAccount: EmptyReply;
  listWorkspaces: WorkspaceListReply;
  saveWorkspace: WorkspaceUploadReply;
  getWorkspace: WorkspaceDownloadReply;
  deleteWorkspace: EmptyReply;
}
export type AccountFailure = { status: 400 | 404 | 409; body: AccountError };
export type AccountReply<K extends keyof AccountReplies = keyof AccountReplies> =
  { status: 200; body: AccountReplies[K] } | AccountFailure;
