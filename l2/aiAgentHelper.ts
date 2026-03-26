/// <mls fileReference="_102029_/l2/aiAgentHelper.ts" enhancement="_blank"/>

/**
 * Helper function to collect all steps from a task in a flat array
 */
export const getAllSteps = (firstStep: mls.msg.AIPayload[] | undefined): mls.msg.AIPayload[] => {
  if (!firstStep || firstStep.length < 1) {
    return [];
  }
  const allSteps: mls.msg.AIPayload[] = [];
  const queue: mls.msg.AIPayload[] = [...firstStep];

  // BFS approach to collect all steps
  while (queue.length > 0) {
    const currentStep = queue.shift()!;
    allSteps.push(currentStep);

    // Add nextSteps to queue if they exist
    if (currentStep.nextSteps) {
      queue.push(...currentStep.nextSteps);
    }

    // Add steps from interaction.payload if they exist
    if (currentStep.interaction?.payload) {
      queue.push(...currentStep.interaction.payload);
    }
  }

  return allSteps;
};

export const getAgentStepByAgentName = (task: mls.msg.TaskData, agentName: string): mls.msg.AIPayload | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.find((step): step is mls.msg.AIAgentStep => step.type === 'agent' && step.agentName === agentName);
  return agentSteps || null;
};

export const getAllAgentStepByAgentName = (task: mls.msg.TaskData, agentName: string): mls.msg.AIPayload[] | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIAgentStep => step.type === 'agent' && step.agentName === agentName);
  return agentSteps || null;
};

export const getAgentsStepByAgentName = (task: mls.msg.TaskData, agentName: string, status?: mls.msg.AIStepStatus): mls.msg.AIPayload[] => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIAgentStep => step.type === 'agent' && step.agentName === agentName);
  if (!status) return agentSteps || [];
  return agentSteps.filter(step => step.status === status);
};


export const getStepById = (task: mls.msg.TaskData, stepId: number): mls.msg.AIPayload | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  return allSteps.find(step => step.stepId === stepId) || null;
};

export const getNextPendentStep = (task: mls.msg.TaskData): mls.msg.AIPayload | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  return allSteps.find(step => step.status === 'pending') || null;
};

export const getNextResultStep = (task: mls.msg.TaskData): mls.msg.AIResultStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIResultStep => step.type === 'result');
  return agentSteps.find(step => step.status === 'completed') || null;
}

export const getNextClarificationStep = (task: mls.msg.TaskData): mls.msg.AIClarificationStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIClarificationStep => step.type === 'clarification');
  return agentSteps.find(step => step.status === 'pending') || null;
}

export const getNextPendingStepByAgentName = (task: mls.msg.TaskData, agentName: string): mls.msg.AIAgentStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIAgentStep => step.type === 'agent');
  return agentSteps.find(step => step.status === 'pending' && step.agentName === agentName) || null;
}

export const getNextFlexiblePendingStep = (task: mls.msg.TaskData): mls.msg.AIFlexibleResultStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIFlexibleResultStep => step.type === 'flexible');
  return agentSteps.find(step => step.status === 'pending') || null;
}

export const getNextInProgressStepByAgentName = (task: mls.msg.TaskData, agentName: string): mls.msg.AIAgentStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIAgentStep => step.type === 'agent');
  return agentSteps.find(step => step.status === 'in_progress' && step.agentName === agentName) || null;
}

export const getRootAgent = (task: mls.msg.TaskData): mls.msg.AIAgentStep | null => {
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  const agentSteps = allSteps.filter((step): step is mls.msg.AIAgentStep => step.type === 'agent');
  return agentSteps[0] || null;
}

export const getInteractionStepId = (task: mls.msg.TaskData, stepId: number): number | null => {
  // nextSteps []
  // | interaction
  // | | nextsSteps []
  // ...
  // this routine find the parent interaction stepId
  const allSteps = getAllSteps(task.iaCompressed?.nextSteps);
  if (!allSteps) return null;

  for (const step of allSteps) {
    if (!step.interaction || !step.interaction.payload) continue;
    if (step.interaction.payload.length < 1) continue;
    if (step.interaction.payload.find(s => s.stepId === stepId)) return step.stepId;
  }

  return null;
}

export type StatisticsAITask = {
  agents: number, tools: number, clarification: number, result: number, flexible: number,
  totalCost: number, totalSteps: number,
};

export const calculateStepsStatistics = (steps: mls.msg.AIPayload[], removeFirstStep: boolean): StatisticsAITask => {
  const allSteps = getAllSteps(steps);
  if (removeFirstStep) allSteps.shift();

  return {
    agents: allSteps.filter(step => step.type === 'agent').length,
    tools: allSteps.filter(step => step.type === 'tool').length,
    clarification: allSteps.filter(step => step.type === 'clarification').length,
    result: allSteps.filter(step => step.type === 'result').length,
    flexible: allSteps.filter(step => step.type === 'flexible').length,
    totalCost: allSteps.reduce((sum, step) => sum + (step.interaction?.cost || 0), 0),
    totalSteps: allSteps.length
  };
};

export const calculateStepsByFilter = (task: mls.msg.TaskData, filter: Record<string, any>): number => {
  const allSteps: mls.msg.AIPayload[] = getAllSteps(task.iaCompressed?.nextSteps);
  // example: calculateStepsByFilter(task, { toolName: "abc "})
  let result = 0;
  for (const step of allSteps) {
    let allPropertiesMatch: boolean = true;
    for (const [key, value] of Object.entries(filter)) {
      const value2 = (step as any)[key];
      if (value2 !== value) {
        allPropertiesMatch = false;
        break; // exit for
      }
    }
    if (allPropertiesMatch) result += 1;
  }
  return result;
};

export const getTemporaryContext = (threadId: string, userId: string, prompt: string): mls.msg.ExecutionContext => {
  // create temporary context

  const now = new Date();
  const formattedDate = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours() + 3).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0')
    + "." + Math.floor(1000 + Math.random() * 9000);

  const context: mls.msg.ExecutionContext = {
    task: undefined,
    message: {
      threadId: threadId,
      orderAt: "",
      createAt: formattedDate,
      senderId: userId,
      content: prompt.trim(),
    },
    isTest: false
  };
  return context;
};

export function notifyMessageSendChange(context: mls.msg.ExecutionContext): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('message-send', {
    detail: { context },
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}

export function notifyTaskChange(context: mls.msg.ExecutionContext, oldContextCreateAt?: string): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('task-change', {
    detail: { context, oldContextCreateAt },
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}

export function notifyTaskCompleted(context: mls.msg.ExecutionContext, result?: string): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('task-completed', {
    detail: { context, result },
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}

export function notifyThreadChange(thread: mls.msg.Thread): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('thread-change', {
    detail: thread,
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}

export function notifyMessageChange( message: mls.msg.Message): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('message-change', {
    detail: message,
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}


export function notifyThreadCreate(thread: mls.msg.Thread): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('thread-create', {
    detail: thread,
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}

export function dispatchDetailsTaskClose(taskId: string): void {
  const scopeWindow = window?.top ? window.top : window;
  const event = new CustomEvent('task-details-close', {
    detail: taskId,
    bubbles: true,
    composed: true
  });
  scopeWindow.dispatchEvent(event);
}


export function getTotalCost(task: mls.msg.TaskData): string {
  let tot = 0;
  const nextSteps = task.iaCompressed?.nextSteps;
  if (!nextSteps || nextSteps.length === 0) return "$ 0.01"; // garante saída mínima

  const sumCosts = (payload: mls.msg.AIPayload[]) => {
    payload.forEach((pay) => {
      const { interaction, nextSteps } = pay;

      if (interaction) {
        tot += interaction.cost ? interaction.cost : 0;
        if (interaction.payload) sumCosts(interaction.payload);
      }

      if (nextSteps) {
        nextSteps.forEach((next) => sumCosts([next]));
      }
    });
  };

  nextSteps.forEach((step) => sumCosts([step]));

  const rounded = Math.ceil(tot * 100) / 100;
  return `${rounded.toFixed(2)}`;
}


export function getNextStepIdAvaliable(task: mls.msg.TaskData): number {

  let nextStepId = 0;
  const nextSteps = task.iaCompressed?.nextSteps;
  if (!nextSteps || nextSteps.length === 0) return nextStepId + 1;

  const findNextStepId = (payload: mls.msg.AIPayload[]) => {
    payload.forEach((pay) => {
      const { interaction, nextSteps, stepId } = pay;
      if (stepId > nextStepId) nextStepId = stepId + 1;
      if (interaction) {
        if (interaction.payload) findNextStepId(interaction.payload);
      }
      if (nextSteps) {
        nextSteps.forEach((next) => {
          if (next.stepId > nextStepId) nextStepId = next.stepId + 1;
          findNextStepId([next])
        });
      }

    });
  };

  nextSteps.forEach((step) => {
    if (step.stepId > nextStepId) nextStepId = step.stepId + 1;
    findNextStepId([step]);
  });
  return nextStepId;
}

