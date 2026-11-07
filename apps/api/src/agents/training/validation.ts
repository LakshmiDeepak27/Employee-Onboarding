import type {
  TrainingCourseContext,
  TrainingEmployeeContext,
  TrainingRecommendation,
  TrainingTaskContext,
  ValidatedTrainingRecommendation,
} from './state.js';

export interface TrainingValidationResult {
  validRecommendations: ValidatedTrainingRecommendation[];
  errors: string[];
  warnings: string[];
  statutoryFindings: string[];
  requiresHumanReview: boolean;
}

interface ValidationInput {
  employee: TrainingEmployeeContext;
  tasks: TrainingTaskContext[];
  courses: TrainingCourseContext[];
  recommendations: TrainingRecommendation['recommendations'];
}

export function validateTrainingRecommendations(
  input: ValidationInput,
): TrainingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const statutoryFindings: string[] = [];

  const validRecommendations: ValidatedTrainingRecommendation[] = [];

  const taskMap = new Map(
    input.tasks.map((task) => [task.taskId, task]),
  );

  const courseMap = new Map(
    input.courses.map((course) => [course.id, course]),
  );

  const processedTasks = new Set<string>();

  for (const recommendation of input.recommendations) {
    const task = taskMap.get(recommendation.taskId);

    if (!task) {
      errors.push(
        `Recommendation references a task outside the onboarding plan: ${recommendation.taskId}`,
      );
      continue;
    }

    if (processedTasks.has(task.taskId)) {
      errors.push(
        `Multiple courses were recommended for task ${task.taskId}.`,
      );
      continue;
    }

    const course = courseMap.get(recommendation.courseId);

    if (!course) {
      errors.push(
        `Recommended course is not present in the active course catalogue: ${recommendation.courseId}`,
      );
      continue;
    }

    if (new Date(task.dueDate) < new Date(task.earliestStartDate)) {
      errors.push(
        `Task ${task.taskId} has a due date earlier than its earliest start date.`,
      );
      continue;
    }

    if (
      recommendation.coverage !== 'FULL' ||
      recommendation.verdict !== 'ACCEPT'
    ) {
      warnings.push(
        `Recommendation rejected for task "${task.title}". Coverage: ${recommendation.coverage}. Verdict: ${recommendation.verdict}. Reason: ${recommendation.reasoning}`,
      );

      processedTasks.add(task.taskId);
      continue;
    }

    if (
      course.mandatoryForJurisdictions.length > 0 &&
      !course.mandatoryForJurisdictions.includes(
        input.employee.jurisdictionCode,
      )
    ) {
      warnings.push(
        `Course ${course.code} is not marked mandatory for jurisdiction ${input.employee.jurisdictionCode}.`,
      );
    }

    if (
      course.mandatoryForRoles.length > 0 &&
      !course.mandatoryForRoles.includes(input.employee.roleFamily)
    ) {
      warnings.push(
        `Course ${course.code} is not marked mandatory for role ${input.employee.roleFamily}.`,
      );
    }

    processedTasks.add(task.taskId);

    validRecommendations.push({
      taskId: task.taskId,
      courseId: course.id,
      coverage: 'FULL',
      verdict: 'ACCEPT',
      reasoning: recommendation.reasoning,
    });
  }

  // Check whether every jurisdiction-mandatory course has
  // a fully validated recommendation in this onboarding plan.
  const acceptedCourseIds = new Set(
    validRecommendations.map((recommendation) => recommendation.courseId),
  );

  const mandatoryCourses = input.courses.filter(
    (course) =>
      course.mandatoryForJurisdictions.includes(
        input.employee.jurisdictionCode,
      ),
  );

  for (const course of mandatoryCourses) {
    if (!acceptedCourseIds.has(course.id)) {
      statutoryFindings.push(
        `Statutory training gap: ${course.code} (${course.title}) is mandatory for jurisdiction ${input.employee.jurisdictionCode}, but has no fully validated recommendation in this onboarding plan.`,
      );
    }
  }

  const unmatchedTasks = input.tasks.filter(
    (task) => !processedTasks.has(task.taskId),
  );

  if (unmatchedTasks.length > 0) {
    warnings.push(
      `${unmatchedTasks.length} training task(s) do not have a fully validated course recommendation.`,
    );
  }

  return {
    validRecommendations,
    errors,
    warnings,
    statutoryFindings,
    requiresHumanReview:
      errors.length > 0 ||
      warnings.length > 0 ||
      statutoryFindings.length > 0,
  };
}