import type { UploadReply, UploadRequest } from "./serviceProtocol";

/** Relay service controls share a carrier but are not part of encrypted peer messaging. */
export interface RelayActivation {
  start(): void;
  markFresh(): void;
}

export interface UploadAuthorization {
  requestUpload(this: void, request: UploadRequest): Promise<UploadReply>;
}

/** Shared picture storage is absent in local rooms. */
export interface SharedPictures extends UploadAuthorization {
  download(this: void, hash: string): Promise<Uint8Array | null>;
}
