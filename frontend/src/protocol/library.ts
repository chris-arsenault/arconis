import { z } from "zod";

export const libraryEntrySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  size: z.number().int().positive(),
  revision: z.uuid(),
  updated: z.number(),
  checksum: z.string(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export const libraryListSchema = z.object({ entries: z.array(libraryEntrySchema) });
export const librarySaveSchema = z.object({
  name: z.string().trim().min(1).max(200),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  checksum: z.string().min(1),
});
export type LibrarySave = z.infer<typeof librarySaveSchema>;
export type LibraryRequest = LibrarySave | (LibrarySave & { revision: string });
export type LibraryReply =
  | {
      status: 200;
      body:
        | { entries: LibraryEntry[] }
        | { url: string; revision: string }
        | { entry: LibraryEntry }
        | Record<string, never>;
    }
  | {
      status: 400 | 404 | 409;
      body: { error: string } | { error: string; code: "account_deleting" };
    };
