// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";



import { TImmutableDBKeys } from "./models";

export const ProjectMembershipsSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid(),
  projectId: z.string()
});

export type TProjectMemberships = z.infer<typeof ProjectMembershipsSchema>;
export type TProjectMembershipsInsert = Omit<z.input<typeof ProjectMembershipsSchema>, TImmutableDBKeys>;
export type TProjectMembershipsUpdate = Partial<Omit<z.input<typeof ProjectMembershipsSchema>, TImmutableDBKeys>>;
