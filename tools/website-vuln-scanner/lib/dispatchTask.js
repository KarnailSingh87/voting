// lib/dispatchTask.js
const DEFAULT_NOOP_RESULT = (task) => ({
  status: 'skipped',
  reason: 'unknown task_type',
  taskType: task.task_type || task.type || null,
  task
});

/**
 * Dispatch a task to the appropriate scanner handler.
 * - task: plain object
 * - scanners: map { taskType: handler }
 * - logger: optional (defaults to console)
 *
 * Returns a Promise resolving to the handler's result (supports sync and async handlers).
 */
async function dispatchTask(task, scanners = {}, logger = console) {
  const taskType = task && (task.task_type || task.type);

  if (!taskType || taskType === 'unknown' || !scanners[taskType]) {
    logger.warn('[dispatchTask] Unknown task_type', {
      taskType: taskType ?? '<missing>',
      taskId: (task && task.id) || null,
      // truncated preview to avoid huge logs
      taskPreview: JSON.stringify(task || {}).slice(0, 200)
    });

    // prefer a fallback handler if available
    const fallback = scanners['noop'] || scanners['unknown'];
    if (fallback) {
      return await Promise.resolve(fallback(task));
    }

    return DEFAULT_NOOP_RESULT(task || {});
  }

  const handler = scanners[taskType];
  return await Promise.resolve(handler(task));
}

module.exports = { dispatchTask };
