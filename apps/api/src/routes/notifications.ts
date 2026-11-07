import { Router } from "express";
import { z } from "zod";
import { Uuid, PaginationQuery } from "@eo/contracts";
import { prisma } from "../db/client.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate, query } from "../middleware/validate.js";
import { notFound } from "../lib/errors.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/notifications",
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const { page, pageSize } = query<typeof PaginationQuery>(req);
      const where = { userId: req.auth!.userId };
      const [items, totalItems] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.notification.count({ where }),
      ]);

      res.json({
        items: items.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          link: item.link,
          read: item.readAt !== null,
          createdAt: item.createdAt.toISOString(),
        })),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.patch(
  "/notifications/:id/read",
  validate({ params: z.object({ id: Uuid }) }),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const notification = await prisma.notification.findFirst({
        where: { id, userId: req.auth!.userId },
        select: { id: true },
      });
      if (!notification) throw notFound("Notification");

      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      res.json({
        id: updated.id,
        read: updated.readAt !== null,
        readAt: updated.readAt?.toISOString() ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);
