import { prisma } from "../db/client.js";

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      sentAt: new Date(),
    },
  });
}

export async function notifyUsers(
  userIds: Array<string | null | undefined>,
  input: Omit<Parameters<typeof createNotification>[0], "userId">,
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];
  return Promise.all(ids.map((userId) => createNotification({ userId, ...input })));
}
