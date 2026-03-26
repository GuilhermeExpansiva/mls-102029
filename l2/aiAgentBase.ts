/// <mls fileReference="_102029_/l2/aiAgentBase.ts" enhancement="_102027_/l2/enhancementLit"/>

import { TemplateResult } from 'lit';

/**
 * Agent Architecture Overview
 *
 * The platform supports two agent models. The developer must choose
 * **one model per agent**, based on responsibility and complexity.
 *
 * 1) IAgent (procedural model)
 *    - The agent participates in the execution lifecycle.
 *    - It may orchestrate steps, call tools, and trigger side effects.
 *    - Responsibility: **who executes**.
 *    - Use this when flexibility and custom flow control are required.
 * 
 * 2) IAgentAsync (declarative model)
 *    - The agent only describes what should be done and returns data
 *      (e.g. system and human prompts).
 *    - It does NOT execute side effects or control the flow.
 *    - Responsibility: **who describes what must be done**.
 *    - The core is responsible for execution, retries, policies, and limits.
 *    - This model naturally enables **parallel execution**, since agents
 *      are stateless and independent.
 *    - Multiple steps may run concurrently without increasing agent complexity.
 *    - Use this model when simplicity, predictability, testability,
 *      and parallelism are important.
 *
 * Both models coexist without breaking changes.
 * Choose the simplest model that satisfies your use case.
 */

export type IAgent = IAgentMeta & IAgentLifecycle & IAgentLifecycleSync;
export type IAgentAsync = IAgentMeta & IAgentLifecycle & IAgentLifecycleHooks;

export type IAgentMeta = {
  visibility: 'public' | 'private';
  agentName: string;
  agentProject?: number; // todo: remove ?
  agentFolder?: string; // todo: remove ?
  scope?: string[];
  avatar_url?: string;
  agentDescription: string;
}

export type IAgentLifecycle = {
  beforeClarification?(context: mls.msg.ExecutionContext, stepId: number, readOnly: boolean): Promise<HTMLDivElement | null>;
  afterClarification?(context: mls.msg.ExecutionContext, stepId: number, data: object): Promise<void>;
  afterTool?(context: mls.msg.ExecutionContext, stepId: number): Promise<void>;
  installBot?(context: mls.msg.ExecutionContext): Promise<boolean>;
  beforeBot?(context: mls.msg.ExecutionContext, msg: string, toolsBeforeSendMessage: mls.bots.ToolsBeforeSendMessage[]): Promise<Record<string, any>>;
  afterBot?(context: mls.msg.ExecutionContext, output: mls.msg.BotOutput): Promise<string>;
  replayForSupport?(task: mls.msg.ExecutionContext, payload: mls.msg.AIPayload[]): Promise<void>;

  getFeedBack?(task: mls.msg.TaskData): Promise<TemplateResult>;
}

export type IAgentLifecycleSync = {
  beforePrompt(context: mls.msg.ExecutionContext): Promise<void>;
  afterPrompt(context: mls.msg.ExecutionContext): Promise<void>;
}

/**
 * Declarative agent lifecycle hooks.
 *
 * These hooks describe what should happen at each entry point
 * without executing side effects (no tool calls, no I/O, no UI).
 *
 * The core orchestrator is responsible for executing the returned intents.
 * Async agents must implement at least one of these entry points.
 */
export type IAgentLifecycleHooks = {

  /**
   * Called when the agent is invoked with an explicit user prompt
   * in the context of a file (editor, UI, etc).
   *
   * This starts a new task and returns declarative intents
   * describing the next steps to execute.
   */
  beforePromptAtomic?(
    agent: IAgentMeta,
    context: mls.msg.ExecutionContext,
    file: mls.stor.IFileInfo,
    userPrompt: string
  ): Promise<mls.msg.AgentIntent[]>

  /**
   * Called when the agent is invoked without a free-form user prompt.
   *
   * The user may optionally provide a command or parameters as part of the
   * agent invocation (e.g. "@@agentFix", "@@agentFix security").
   *
   * In this mode, the agent does not receive an explicit descriptive prompt.
   * Instead, the system infers the initial intent based on:
   * - the agent name
   * - optional command or parameters
   * - the current execution context
   *
   * This hook is responsible for creating a new task and returning the
   * initial orchestration intents.
   */
  beforePromptImplicit?(
    agent: IAgentMeta,
    context: mls.msg.ExecutionContext,
    userPrompt: string
  ): Promise<mls.msg.AgentIntent[]>

  /**
   * Called when the agent is executed as part of an existing task,
   * following a previous step.
   *
   * The agent should read the current task state from the context
   * and return intents describing how the task should continue.
   *
   * Example:
   *   step1 -> agentFix
   *   step2 -> agentFix2 (reads data produced by agentFix)
   */
  beforePromptStep?(
    agent: IAgentMeta,
    context: mls.msg.ExecutionContext,
    parentStep: mls.msg.AIAgentStep,
    step: mls.msg.AIAgentStep,
    hookSequential: number,
    args?: string
  ): Promise<mls.msg.AgentIntent[]>

  /**
   * Called after a step has completed, allowing the agent to
   * react declaratively to the step result and append new intents.
   */
  afterPromptStep?(
    agent: IAgentMeta,
    context: mls.msg.ExecutionContext,
    parentStep: mls.msg.AIAgentStep,
    step: mls.msg.AIAgentStep,
    hookSequential: number,
  ): Promise<mls.msg.AgentIntent[]>


  /**
   * Called after a step user call to answer clarification allowing the agent to
   * react declaratively to the clarification result and append new intents.
   */
  beforeClarificationStep?(
    agent: IAgentMeta,
    context: mls.msg.ExecutionContext,
    parentStep: mls.msg.AIAgentStep,
    step: mls.msg.AIClarificationStep,
    hookSequential: number,
    json: any
    ,
  ): Promise<HTMLElement>

}

export interface ITool {
  toolName: string;
  tool_url: string | undefined;
  description: string;
  argsSchema: Record<string, any>;
  execute(args: Record<string, any>): Promise<any>;
}

export const svg_tool = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M176 88l0 40 160 0 0-40c0-4.4-3.6-8-8-8L184 80c-4.4 0-8 3.6-8 8zm-48 40l0-40c0-30.9 25.1-56 56-56l144 0c30.9 0 56 25.1 56 56l0 40 28.1 0c12.7 0 24.9 5.1 33.9 14.1l51.9 51.9c9 9 14.1 21.2 14.1 33.9l0 92.1-128 0 0-32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 32-128 0 0-32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 32L0 320l0-92.1c0-12.7 5.1-24.9 14.1-33.9l51.9-51.9c9-9 21.2-14.1 33.9-14.1l28.1 0zM0 416l0-64 128 0c0 17.7 14.3 32 32 32s32-14.3 32-32l128 0c0 17.7 14.3 32 32 32s32-14.3 32-32l128 0 0 64c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64z"/></svg>`

export const svg_agent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M320 0c17.7 0 32 14.3 32 32l0 64 120 0c39.8 0 72 32.2 72 72l0 272c0 39.8-32.2 72-72 72l-304 0c-39.8 0-72-32.2-72-72l0-272c0-39.8 32.2-72 72-72l120 0 0-64c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224l16 0 0 192-16 0c-26.5 0-48-21.5-48-48l0-96c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 96c0 26.5-21.5 48-48 48l-16 0 0-192 16 0z"/></svg>`


/**
 * Agent middleware is a function that receives an IAgent and returns
 * a new IAgent that wraps the original one.
 *
 * Middleware must NOT change the agent contract or business semantics.
 * It should only handle cross-cutting concerns such as logging,
 * metrics, tracing, retries, or safety checks.
 *
 * Middleware should be stateless and rely on the execution context
 * for any per-run data, ensuring it works with singleton or factory-based agents.
 *
 * Usage pattern:
 *   const agent = withLogging(createAgent())
 */

/**
 * Example
 * Adds logging around agent execution lifecycle.
 *
 * This middleware logs when the agent starts and finishes processing
 * a prompt without requiring any changes to the agent implementation.
 *
 * It wraps existing hooks safely and preserves optional capabilities.
 */
export function withLogging(agent: IAgent): IAgent {
  return {
    ...agent,

    async beforePrompt(context) {
      console.log(`[agent:${agent.agentName}] beforePrompt`)
      await agent.beforePrompt?.(context)
    },

    async afterPrompt(context) {
      await agent.afterPrompt?.(context)
      console.log(`[agent:${agent.agentName}] afterPrompt`)
    }
  }
}

