/// <mls fileReference="_102029_/l2/aiAgentOrchestration.ts" enhancement="_blank"/>

import {
    getNextPendentStep,
    getStepById,
    getInteractionStepId,
    notifyTaskChange,
    notifyThreadChange,
    getRootAgent
} from "/_102029_/l2/aiAgentHelper.js";

import { IAgent, IAgentAsync } from '/_102029_/l2/aiAgentBase.js';
import { storage } from '/_102029_/l2/storageAdapter.js';

const agentName = 'aiAgentOrchestration';

export async function executeBeforePrompt(agent: IAgent | IAgentAsync, context: mls.msg.ExecutionContext): Promise<void> {
    // execute one of this: beforePrompt, beforePromptAtomic, beforePromptImplicit
    if ((agent as IAgent).beforePrompt) return await (agent as IAgent).beforePrompt(context);
    agent = agent as IAgentAsync;
    let content = context.message.content;
    if (content.startsWith("@@")) content = content.split(" ").slice(1).join(" ").trim(); // remove agent name
    if (mls.isTraceAgent) console.log(`[executeBeforePrompt] content:"${content}"`)

    if (agent.beforePromptAtomic) {
        // file ref
        const { jsonText, rest } = splitJsonAndText(content)
        const file = mls.stor.getFileStorFromJson(jsonText, {});
        if (mls.isTraceAgent) console.log(`[executeBeforePrompt] isAtomic=${file ? "yes:" + JSON.stringify(file) : "no"}, userPromptAfterJson:${rest}`)
        if (file) {
            const intents = await agent.beforePromptAtomic(agent, context, file, rest);
            return await processIntents(agent, context, intents);
        }
    }
    if (agent.beforePromptImplicit) {
        // no structured args
        if (mls.isTraceAgent) console.log(`[executeBeforePrompt] implicit`)
        const intents = await agent.beforePromptImplicit(agent, context, content);
        return await processIntents(agent, context, intents);
    }
    throw new Error(`Invalid agent ${agent.agentName}, no beforePrompt`);
}

function splitJsonAndText(input: string): { jsonText: string; rest: string } {
    const start = input.indexOf("{");
    const end = input.indexOf("}");

    if (start === -1 || end === -1 || end < start) return { jsonText: input, rest: "" };

    const jsonText = input.slice(start, end + 1).trim();
    const rest = input.slice(end + 1).trim();

    return { jsonText, rest };
}

const taskControllers = new Map<string, AbortController>();
const MAX_HOOKS_PER_TURN = 5;
const runningTasks = new Set<string>();

async function processIntents(
    agent: IAgentAsync,
    context: mls.msg.ExecutionContext,
    intents: mls.msg.AgentIntent[]
): Promise<void> {

    if (mls.isTraceAgent) console.log(`[processIntents] intents length: ${intents.length}`);
    const messageId = context.message.createAt;
    if (!messageId) return;

    taskControllers.get(messageId)?.abort();
    const controller = new AbortController();
    taskControllers.set(messageId, controller);
    const signal = controller.signal;

    try {
        await _processIntents(agent, context, intents, signal);
    }
    finally {
        if (taskControllers.get(messageId) === controller) {
            taskControllers.delete(messageId);
        }
    }
}

async function _processIntents(
    agent: IAgentAsync,
    context: mls.msg.ExecutionContext,
    intents: mls.msg.AgentIntent[],
    signal: AbortSignal
): Promise<void> {

    if (signal.aborted) return;

    const oldContextCreateAt = context.message.createAt;
    const isAddMessageAI = intents.some(i => i.type === 'add-message-ai');

    const value = await mls.api.msgApplyIntents({
        userId: context.message.senderId,
        intents
    });

    if (!value) throw new Error(`[${agentName}] Error on msgApplyIntents`);
    if (value.statusCode !== 200) throw new Error(`[${agentName}] Error: ${value.msg || ''}`);
    if (signal.aborted) return;

    const ret = value as mls.msg.ResponseApplyIntents;
    context.task = ret.task;
    if (ret.message) context.message = ret.message;
    notifyTaskChange(context, isAddMessageAI ? oldContextCreateAt : undefined);

    if (!context.task?.iaCompressed) return;
    runningTasks.add(ret.task.PK);

    await storage.addPooling({
        taskId: ret.task.PK,
        userId: context.task?.owner ?? '',
        startAt: Date.now().toString()
    });

    if (signal.aborted) return;

    let _hooks = context.task.iaCompressed.queueFrontEnd || [];
    const hooksToProcess = _hooks
        .filter(h => h.type !== 'pooling')
        .slice(0, 5);

    let newIntents: mls.msg.AgentIntent[] = [];

    for await (const hook of hooksToProcess) {
        let agentToExecute: IAgentAsync | undefined = agent;
        const agentByHookStep = getStepById(context.task, hook.stepId);
        if (agentByHookStep && agentByHookStep.type === "agent" && agent.agentName !== (agentByHookStep as mls.msg.AIAgentStep).agentName) {
            agentToExecute = await loadAgent((agentByHookStep as mls.msg.AIAgentStep).agentName);
        }
        if (!agentToExecute) throw new Error(`[${agentName}](startNewAiTask) Invalid agent in hook step`);
        agent = agentToExecute;
        newIntents.push(...await processIntents2(agentToExecute, context, hook), ...getRemoveIntent(context, hook));
    }

    await storage.addOrUpdateTask(context.task); // UI feedback, update task in indexedDB
    if (signal.aborted) return;

    if (newIntents.length < 1) {
        newIntents = await processHookPooling(context);
        if (newIntents.length < 1) {
            runningTasks.delete(ret.task.PK);
            await storage.deletePooling(ret.task.PK);
            return; // just leave
        }
    }

    await _processIntents(agent, context, newIntents, signal); // reentrance processIntents, fire and forget to fast UI feedback 
}

async function processIntents2(agent: IAgentAsync, context: mls.msg.ExecutionContext, hook: mls.msg.AgentHooks): Promise<mls.msg.AgentIntent[]> {

    try {
        if (hook.type === "beforePromptStep") return await processHookBeforePromptStep(agent, context, hook);
        if (hook.type === "afterPromptStep") return await processHookAfterPromptStep(agent, context, hook);
        if (hook.type === "beforeTool") return await processHookBeforeTool(agent, context, hook);

        throw new Error(`not implemented processIntents process hooks, type:${hook.type}`);
    } catch (e: any) {

        console.error(`error processing taskid:${context.task?.PK}, hook:${hook.type}, message:${e.message || e} `);
        if (!context.task) return [];
        const step = getStepById(context.task, hook.stepId) as mls.msg.AIAgentStep;
        const parentStep = getStepById(context.task, (hook as mls.msg.AgentHookAfterPromptStep).parentStepId) as mls.msg.AIAgentStep;
        const updateStatusFailed: mls.msg.AgentIntentUpdateStatus = {
            type: 'update-status',
            hookSequential: 0,
            messageId: context.message.orderAt,
            threadId: context.message.threadId,
            taskId: context.task?.PK || '',
            parentStepId: parentStep.stepId,
            stepId: step.stepId,
            status: 'failed'
        };
        return [updateStatusFailed];
    }
}

function getRemoveIntent(context: mls.msg.ExecutionContext, hook: mls.msg.AgentHooks): mls.msg.AgentIntentRemoveHook[] {
    return [{
        type: 'remove-hook',
        hookSequential: hook.hookSequential,
        threadId: context.message.threadId,
        messageId: context.message.orderAt,
        taskId: context.task?.PK || ''
    }];
}

async function processHookBeforePromptStep(agent: IAgentAsync, context: mls.msg.ExecutionContext, hook: mls.msg.AgentHookBeforePromptStep): Promise<mls.msg.AgentIntent[]> {

    if (!agent.beforePromptStep) throw new Error(`Agent ${agent.agentName} do not have beforePromptStep`);
    if (!context.task) throw new Error('[processHookBeforePromptStep] invalid task');
    const step = getStepById(context.task, hook.stepId) as mls.msg.AIAgentStep;
    const parentStep = getStepById(context.task, hook.parentStepId) as mls.msg.AIAgentStep;
    if (!step || !parentStep) throw new Error('[processHookBeforePromptStep] invalid stepId or parentStepId');
    const rc = await agent.beforePromptStep(agent, context, parentStep, step, hook.hookSequential, hook.args);
    return rc;
}

async function processHookAfterPromptStep(agent: IAgentAsync, context: mls.msg.ExecutionContext, hook: mls.msg.AgentHookAfterPromptStep): Promise<mls.msg.AgentIntent[]> {
    if (!agent.afterPromptStep) throw new Error(`Agent ${agent.agentName} do not have afterPromptStep`);
    if (!context.task) throw new Error('[processHookAfterPromptStep] invalid task');
    const step = getStepById(context.task, hook.stepId) as mls.msg.AIAgentStep;
    const parentStep = getStepById(context.task, hook.parentStepId) as mls.msg.AIAgentStep;
    return await agent.afterPromptStep(agent, context, parentStep, step, hook.hookSequential);
}

async function processHookBeforeTool(agent: IAgentAsync, context: mls.msg.ExecutionContext, hook: mls.msg.AgentHookBeforeTool): Promise<mls.msg.AgentIntent[]> {

    let intents: mls.msg.AgentIntent[] = [];

    if (!context.task) throw new Error('[processHookBeforeTool] invalid task');
    const step = getStepById(context.task, hook.stepId) as mls.msg.AIToolStep;
    const parentStep = getStepById(context.task, hook.parentStepId) as mls.msg.AIAgentStep;
    if (!step || !parentStep) throw new Error('[processHookBeforeTool] invalid stepId or parentStepId');
    const rc = await executeTool(step.toolName, step.args);

    if (typeof rc.result !== "string") throw new Error(`Tool ${step.toolName} did not return a string`);
    const existResults = rc.result.length > 0;
    if (existResults) {

        const stepInteraction = getStepById(context.task, parentStep.stepId);
        if (!stepInteraction || stepInteraction.type !== 'agent') throw new Error('Interaction must be type: agent');
        const oldPrompt = stepInteraction.interaction?.input.find((item) => item.type === 'human');

        const newStep: mls.msg.AgentIntentAddStep = {
            type: "add-step",
            messageId: context.message.orderAt,
            threadId: context.message.threadId,
            taskId: context.task?.PK || '',
            parentStepId: parentStep.stepId,
            step:
            {
                type: 'agent',
                stepId: 0,
                interaction: null,
                status: 'waiting_human_input',
                nextSteps: [],
                agentName: stepInteraction.agentName,
                prompt: `${oldPrompt?.content} \n\n Response from tool ${step.toolName}: ${rc.result} `,
                rags: null,
            }
        };

        intents.push(newStep);
    }

    const updateStatus: mls.msg.AgentIntentUpdateStatus = {
        type: 'update-status',
        hookSequential: 0,
        messageId: context.message.orderAt,
        threadId: context.message.threadId,
        taskId: context.task?.PK || '',
        parentStepId: parentStep.stepId,
        stepId: step.stepId,
        status: 'completed'
    };

    return [...intents, updateStatus]

}

async function processHookPooling(context: mls.msg.ExecutionContext): Promise<mls.msg.AgentIntentRemoveHook[]> {
    const hook: mls.msg.AgentHookPooling | undefined = (context.task?.iaCompressed?.queueFrontEnd.find(f => f.type === 'pooling')) as mls.msg.AgentHookPooling;
    let inClarification: boolean = false;
    if (context.task) {
        const step = getNextPendentStep(context.task);
        inClarification = !!step && step.type === "clarification";
        if (inClarification) {
            const threadId = context.message.threadId;
            const taskId = context.task.PK;
            const thread = await storage.updateThreadPendingTasks(threadId, taskId);
            notifyThreadChange(thread);
        }
    }

    if (!hook || !hook.afterMs || hook.afterMs < 1000 || context.task?.status === 'paused' || inClarification) return [];
    //if (!hook || !hook.afterMs || hook.afterMs < 1000) return [];
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(getRemoveIntent(context, hook));
        }, hook.afterMs);
    });
}

export async function continuePoolingTask(context: mls.msg.ExecutionContext) {

    const { task } = context;
    if (!task) return;
    const taskId = task.PK;

    if (runningTasks.has(taskId)) {
        console.warn('Task already in pooling');
        return;
    }

    if (task.status !== 'in progress') {
        storage.deletePooling(taskId);
        return;
    }

    const ia = task.iaCompressed;
    if (!ia) throw new Error('Task has no AI interaction');
    if (!ia.queueFrontEnd) throw new Error('Task has no pending hooks');

    const firstStep = ia.nextSteps?.[0] as mls.msg.AIAgentStep | undefined;
    if (!firstStep) throw new Error('No next step available');
    const agentName = firstStep.agentName;
    const agent = await loadAgent(agentName);
    if (!agent) throw new Error(`[${agentName}] createAgent function not found`);

    runningTasks.add(taskId);
    await storage.addPooling({
        taskId,
        userId: context.task?.owner ?? '',
        startAt: Date.now().toString()
    });

    const hooksToProcess = ia.queueFrontEnd
        .filter(h => h.type !== 'pooling')
        .slice(0, MAX_HOOKS_PER_TURN);

    const intentsFromHooks = (
        await Promise.all(
            hooksToProcess.map(async hook => [
                ...(await processIntents2(agent, context, hook)),
                ...getRemoveIntent(context, hook),
            ])
        )
    ).flat();

    await storage.addOrUpdateTask(task);
    let intents = intentsFromHooks;

    if (intents.length === 0) {
        intents = await processHookPooling(context);
        if (intents.length === 0) {
            runningTasks.delete(taskId);
            await storage.deletePooling(taskId);
            return;
        }
    }

    void processIntents(agent, context, intents);
}

export async function pauseOrContinueTask(
    reason: string,
    context: mls.msg.ExecutionContext,
    action: "paused" | "continue"
): Promise<void> {

    const task = context.task;
    if (!task) throw new Error(`(pauseOrContinueTask) task not found`);

    const ia = task.iaCompressed;
    if (!ia) throw new Error('(pauseOrContinueTask) Task has no AI interaction');

    if (['todo', 'done'].includes(task.status)) throw new Error(`(pauseOrContinueTask) cannot change task with status "${task.status}". Only tasks in "paused" or "continued" state can be modified.`);

    if (task.status === 'paused' && action === 'paused') throw new Error(`(pauseOrContinueTask) task already paused`);

    const intentPauseOrContinue: mls.msg.AgentIntentPauseOrContinue = {
        type: 'pause-or-continue',
        messageId: context.message.orderAt,
        threadId: context.message.threadId,
        taskId: context.task?.PK || '',
        reason,
    };

    const intents: mls.msg.AgentIntent[] = [intentPauseOrContinue];
    const agentRoot = getRootAgent(task)
    if (!agentRoot) throw new Error('(pauseOrContinueTask) Task has no AI agentRoot');
    const agent = await loadAgent(agentRoot.agentName);
    if (!agent) throw new Error(`(pauseOrContinueTask) Agent not found`);
    processIntents(agent, context, intents);

}


//Tools

export async function executeTool(toolName: string, args: string): Promise<IExecuteToolReturn> {
    const rc: IExecuteToolReturn = {
        status: false,
        error: "",
        result: []
    };
    if (!toolName) {
        rc.error = "Tool name is missing";
        return rc;
    };
    try {

        const tool = await loadTool(toolName);
        if (!args) {
            // no args provided
            mls.common.argsValidator({}, tool.argsSchema);
            rc.result = await tool.execute();
        } else {
            const parsedArgs = mls.common.safeParseArgs(args);
            mls.common.argsValidator(parsedArgs, tool.argsSchema);
            rc.result = await tool.execute(parsedArgs);
        }
        rc.status = true;
    } catch (error: any) {
        console.error(`[executeTool] ${error.message || error} `);
        rc.error = error.message || error;
    }
    return rc;
}


// Clarification

export async function finishClarification(
    agent: IAgent | IAgentAsync,
    stepId: number,
    parentStepId: number,
    intents: mls.msg.AgentIntent[],
    context: mls.msg.ExecutionContext,
    value: string,
    action: "continue" | "cancel"): Promise<void> {

    if (context.task) {
        const thread = await storage.updateThreadPendingTasks(context.message.threadId, context.task.PK);
        notifyThreadChange(thread);
    }

    if (action === 'cancel') {
        const updateStatusFailed: mls.msg.AgentIntentUpdateStatus = {
            type: 'update-status',
            hookSequential: 0,
            messageId: context.message.orderAt,
            threadId: context.message.threadId,
            taskId: context.task?.PK || '',
            parentStepId,
            stepId,
            status: 'failed'
        };
        const intentsFailed: mls.msg.AgentIntent[] = [updateStatusFailed];
        return processIntents(agent, context, intentsFailed);
    }

    if (action === 'continue') {

        const intentAddStep = intents.find((step) => step.type === 'add-step') as mls.msg.AgentIntentAddStep;
        if (!intentAddStep) return;

        const agentStep = (intentAddStep.step as mls.msg.AIAgentStep)
        if (agentStep.prompt) {
            const prompt = agentStep.prompt;
            agentStep.prompt = (prompt || '').replace('{{clarification}}', value)
        }

        const newAgent = await loadAgent(agentStep.agentName);
        if (!newAgent) throw new Error(`(pauseOrContinueTask) Agent not found`);
        await processIntents(newAgent, context, intents);

    }

}

export async function prepareClarificationElement(
    agent: IAgent | IAgentAsync,
    context: mls.msg.ExecutionContext,
    stepId: number,
    parentStepId: number,
    intents: mls.msg.AgentIntent[],
    clarification: ClarificationValue | Object | string,
): Promise<HTMLElement> {

    const task = context.task;
    if (!task) throw new Error(`[${agentName}](startClarification) Invalid context.task`);
    let clarificationValue: ClarificationValue | Object = {};

    await import('/_100554_/l2/widgetQuestionsForClarification.js');
    try {
        let ret: any = clarification;
        if (typeof clarification === "string") ret = JSON.parse(clarification || '') as any;
        clarificationValue = {
            taskId: task.PK,
            stepId: 0,
            title: ret.title,
            legends: ret.legends || [],
            userLanguage: ret.userLanguage || '',
            questions: ret.questions
        }
    }
    catch (e) {
        console.error(e);
        throw new Error(`[${agentName}](showClarification) on task: ${task.PK}, json clarification invalid`);
    }


    const div: HTMLElement = document.createElement('div');
    const clariEl = document.createElement('widget-questions-for-clarification-100554');

    clariEl.addEventListener('clarification-finish', (e: Event) => {

        const { detail } = e as CustomEvent<{ value: unknown; action: "continue" | "cancel" }>;
        const { value, action } = detail;
        const normalizedValue =
            value == null
                ? ''
                : typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value);

        finishClarification(
            agent,
            stepId,
            parentStepId,
            intents,
            context,
            normalizedValue,
            action
        );
    });

    (clariEl as any).value = clarificationValue;
    clariEl.setAttribute('mode', 'new');
    div.appendChild(clariEl);
    return div;

}

export async function getClarificationElement(context: mls.msg.ExecutionContext): Promise<HTMLElement> {

    const task = context.task;
    if (!task) throw new Error('Task not find');
    const taskId = task.PK;
    if (task.status !== 'in progress') throw new Error('Task not in progress');

    const ia = task.iaCompressed;
    if (!ia) throw new Error('Task has no AI interaction');
    if (!ia.queueFrontEnd) throw new Error('Task has no pending hooks');

    const ret = await getAgentContext(taskId)
    if (ret.step.type !== "clarification") throw new Error(`[${agentName}](getClarificationElement) Clarification step not not found`);

    const agent: IAgentAsync | undefined = await loadAgent(ret.interaction.agentName);
    if (!agent) throw new Error(`[${agentName}](getClarificationElement) function not found`);
    const fn = agent.beforeClarificationStep;

    if (typeof fn !== "function") throw new Error(`[${agentName}](getClarificationElement) 'beforeClarificationStep' function not found in ${agentName} `);

    const parentId = getInteractionStepId(task, ret.step.stepId);
    if (!parentId) throw new Error(`[${agentName}](getClarificationElement) parentId not found`);

    const parentStep = getStepById(task, parentId) as mls.msg.AIAgentStep;
    if (!parentStep) throw new Error(`[${agentName}](getClarificationElement) parentStep not found`);

    return fn(agent, context, parentStep, ret.step, 0, ret.step.json);

}

// Helpers

export async function getAgentContext(taskId: string): Promise<{
    context: mls.msg.ExecutionContext,
    interaction: mls.msg.AIAgentStep,
    step: mls.msg.AIPayload
}> {
    const task: mls.msg.TaskData | undefined = await storage.getTask(taskId);
    if (!task || !task.messageid_created) throw new Error(`[${agentName}](getAgentContext) Invalid taskId ${taskId}`);
    const step = getNextPendentStep(task);
    if (!step) throw new Error("[getAgentContext] No pending step")
    if (step.type !== "clarification" && step.type !== "tool") throw new Error("[getAgentContext] No pending clarification or tool step");
    const interactionId: number | null = getInteractionStepId(task, step.stepId);
    if (!interactionId) throw new Error("[getAgentContext] Not found interactionId in pending step")
    const interaction: mls.msg.AIPayload | null = getStepById(task, interactionId);
    if (!interaction || interaction.type !== "agent") throw new Error("[getAgentContext] Clarification or tool step not bellow a agent");

    const messageId: string = task.messageid_created;

    const message: mls.msg.Message | undefined = await storage.getMessage(messageId);
    if (!message) throw new Error(`[${agentName}](getAgentContext) Message not found: ${messageId}`)
    const context: mls.msg.ExecutionContext = {
        message,
        task,
        isTest: task.iaCompressed?.isTest || false
    }
    return { context, interaction, step };
}

export async function loadAgent(agentName: string): Promise<IAgent | IAgentAsync | undefined> {
    try {
        const agent = await getInstanceByName(agentName, 'agent');
        return agent;
    } catch (error: any) {
        console.error(`[loadAgent] ${error.message || error} `);
        return undefined;
    }
}

export async function loadTool(toolName: string): Promise<any | undefined> {
    try {
        const tool = await getInstanceByName(toolName, 'tool');
        return tool;
    } catch (error: any) {
        console.error(`[loadTool] ${error.message || error} `);
        return undefined;
    }
}

type InstanceMode = 'agent' | 'tool';

const FACTORY_MAP = {
    agent: 'createAgent',
    tool: 'createTool'
} as const;

/**
 * agentName, ex: 'agentXX1' or '_100554_/l2/agents/agentXX1'
 */
export async function getInstanceByName(
    nameOrPath: string,
    mode: InstanceMode
): Promise<IAgent | IAgentAsync | undefined> {

    const projectActual = mls.actualProject;
    if (!projectActual) throw new Error('Not found project actual!');

    const fileInfo = mls.stor.getPathToFile(nameOrPath);

    const projectsToSearch =
        fileInfo.project > 0
            ? [fileInfo.project]
            : mls.l5.getProjectDependencies(projectActual, true);

    function searchInProject(projectId: number) {
        let foundInFolder: mls.stor.IFileInfo | undefined;

        for (const file of Object.values(mls.stor.files)) {
            if (
                file.project !== projectId ||
                file.extension !== ".ts" ||
                file.shortName !== fileInfo.shortName
            ) continue;

            // 👉 opcional: filtrar por prefixo
            if (mode === 'agent' && !file.shortName.startsWith('agent')) continue;
            if (mode === 'tool' && !file.shortName.startsWith('tool')) continue;

            if (file.folder === '' || file.folder === fileInfo.folder) {
                return file;
            }

            foundInFolder = file;
        }

        return foundInFolder;
    }

    for (const projId of projectsToSearch) {
        const file = searchInProject(projId);
        if (!file) continue;

        try {

            const module = await import(`/_${file.project}_/l2/${file.folder ? file.folder.trim() + '/' : ''}${file.shortName}?t=${Date.now()}`)
            const factoryName = FACTORY_MAP[mode];
            const factory = module[factoryName];

            if (typeof factory !== "function") {
                throw new Error(
                    `[getInstanceByName] ${factoryName} not found in ${file.shortName}`
                );
            }

            return factory();
        } catch (error: any) {
            console.error(`[load${mode}] ${error.message || error}`);
            return undefined;
        }
    }

    return undefined;
}

export interface IExecuteToolReturn {
    status: boolean;
    error: string;
    result: any;
}

// Types for the JSON structure
export interface ClarificationValue {
    taskId: string;
    stepId: number;
    title: string;
    userLanguage: string;
    questions: ClarificationQuestions;
    legends: string[];
}

export interface ClarificationQuestions {
    [key: string]: Question;
}

export interface Question {
    type: 'open' | 'select' | 'boolean' | 'MoSCoW' | 'range';
    question: string;
    answer?: string | boolean;
    options?: QuestionOption[];
}

export interface QuestionOption {
    id: string;
    label: string;
}
