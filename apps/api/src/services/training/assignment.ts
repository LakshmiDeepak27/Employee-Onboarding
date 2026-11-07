
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { conflict, notFound } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';

interface CreateAssignmentInput {
  taskId: string;
  courseId: string;
  dueDate?: string;
}

export async function createTrainingAssignment(
  req: Request,
  input: CreateAssignmentInput,
) {
  const task = await prisma.planTask.findFirst({
    where: {
      id: input.taskId,
      service: 'TRAINING',
    },
    include: {
      plan: {
        select: {
          status: true,
          employee: {
            select: {
              id: true,
              startDate: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw notFound('Training task');
  }

  if (!['APPROVED', 'IN_PROGRESS'].includes(task.plan.status)) {
    throw conflict(
      'Training assignments can only be created for approved or in-progress onboarding plans.',
    );
  }

  const course = await prisma.trainingCourse.findFirst({
    where: {
      id: input.courseId,
      isActive: true,
    },
  });

  if (!course) {
    throw notFound('Active training course');
  }

  const existing = await prisma.trainingAssignment.findUnique({
    where: {
      taskId: input.taskId,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw conflict('A training assignment already exists for this task');
  }

  // Preserve the deterministic task deadline.
  let dueDate = task.dueDate;

  // Apply the statutory deadline when one exists.
  if (course.statutoryDeadlineDays !== null) {
    const statutoryDueDate = new Date(task.plan.employee.startDate);

    statutoryDueDate.setUTCDate(
      statutoryDueDate.getUTCDate() + course.statutoryDeadlineDays,
    );

    if (statutoryDueDate < dueDate) {
      dueDate = statutoryDueDate;
    }
  }

  if (input.dueDate) {
    const requestedDueDate = new Date(
      `${input.dueDate}T00:00:00.000Z`,
    );

    if (
      Number.isNaN(requestedDueDate.getTime()) ||
      requestedDueDate > dueDate
    ) {
      throw conflict(
        'The requested due date cannot exceed the applicable task or statutory deadline',
      );
    }

    dueDate = requestedDueDate;
  }

  const assignment = await prisma.trainingAssignment.create({
    data: {
      taskId: input.taskId,
      courseId: course.id,
      dueDate,
    },
    include: {
      course: {
        select: {
          id: true,
          code: true,
          title: true,
          provider: true,
          durationMinutes: true,
          mandatoryForJurisdictions: true,
          mandatoryForRoles: true,
          statutoryDeadlineDays: true,
        },
      },
    },
  });

  await writeAudit(req, {
    action: 'training.assigned',
    resourceType: 'training_assignment',
    resourceId: assignment.id,
    after: {
      taskId: input.taskId,
      courseId: course.id,
      employeeId: task.plan.employee.id,
      dueDate: dueDate.toISOString(),
    },
  });

  return {
    id: assignment.id,
    taskId: assignment.taskId,
    course: assignment.course,
    status: assignment.status,
    assignedAt: assignment.assignedAt.toISOString(),
    dueDate: assignment.dueDate.toISOString().slice(0, 10),
    startedAt: assignment.startedAt?.toISOString() ?? null,
    completedAt: assignment.completedAt?.toISOString() ?? null,
    scorePercent: assignment.scorePercent,
    isStatutory: assignment.course.statutoryDeadlineDays !== null,
  };
}
