/// <mls fileReference="_102029_/l2/aiAgentDefaultFeedback.ts" enhancement="_102027_/l2/enhancementLit" />

import { html, TemplateResult, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StateLitElement } from '/_102029_/l2/stateLitElement.js';
import { continuePoolingTask, pauseOrContinueTask } from '/_102029_/l2/aiAgentOrchestration.js';
import { getNextPendentStep } from "/_102029_/l2/aiAgentHelper.js";

@customElement('ai-agent-default-feedback-102029')
export class AiAgentDefaultFeedback102029 extends StateLitElement {

    @state() task?: mls.msg.TaskData;
    @state() message?: mls.msg.Message;
    @state() selectedStep: mls.msg.AIPayload | null = null;
    @state() selectedTraceStep: mls.msg.AIPayload | null = null;
    @state() isAgentParallelMode: boolean = false;

    async firstUpdated() {
        this.isAgentParallelMode = !!this.task?.iaCompressed?.nextSteps[0].progress;
    }

    updated(_changedProperties: Map<PropertyKey, unknown>) {
        super.updated(_changedProperties);
        if (_changedProperties.has('task')) {
            this.isAgentParallelMode = !!this.task?.iaCompressed?.nextSteps[0].progress;
        }
    }

    private getTitle(
        step:
            | mls.msg.AIAgentStep
            | mls.msg.AIToolStep
            | mls.msg.AIClarificationStep
            | mls.msg.AIResultStep
            | mls.msg.AIFlexibleResultStep
    ): string {
        return (
            step.stepTitle ||
            (step as mls.msg.AIAgentStep).agentName ||
            (step as mls.msg.AIToolStep).toolName ||
            step.type ||
            'step'
        );
    }


    private getIconStep(status?: mls.msg.AIStepStatus) {
        switch (status) {
            case 'completed': return html`<div class="success">${this.iconOk}</div>`;
            case 'in_progress': return html`<div class="loader"></div>`;
            case 'failed': return html`<div class="error">${this.iconError}</div>`;
            case 'pending': return html`<div class="pending">${this.iconPending}</div>`;
            case 'waiting_after_prompt': return html`<div class="waiting">${this.iconWaitingAfter}</div>`;
            case 'waiting_human_input': return html`<div class="waiting">${this.iconWaitingHumam}</div>`
            default: return '•';
        }
    }

    private getIconTask(status?: string) {

        if (!this.task) return '';
        let _status = status;
        const step = getNextPendentStep(this.task);
        if (step && step.type === "clarification") _status = 'clarification';
        switch (_status) {
            case 'done': return html`<div class="success">${this.iconOk}</div>`
            case 'in progress': return html`<div class="loader"></div>`;
            case 'failed': return html`<div class="error">${this.iconError}</div>`;
            case 'paused': return html`<div class="paused">${this.iconTaskPaused}</div>`
            case 'clarification': return html`
                <span class="icon-wrapper">
                    ${this.collab_bell}
                    <span class="notification-badge">1</span>
                </span>`;
            default: return '•';
        }
    }

    private getChildren(step: mls.msg.AIPayload) {
        return [
            ...(step.nextSteps ?? []),
            ...(step.interaction?.payload ?? [])
        ];
    }

    private renderStep(step: mls.msg.AIPayload, depth = 0): TemplateResult {

        const children = this.getChildren(step);
        const hasChildren = children.length > 0;

        if (step.type === 'flexible' || step.type === 'result' || (step.type === 'clarification' && step.status === 'completed')) {
            return html`
             ${hasChildren
                    ? children.map((s: mls.msg.AIPayload) =>
                        this.renderStep(s, depth)
                    )
                    : nothing}
             `
        }

        return html`
        <div class="step" style="padding-left:${depth + 15}px; ${depth !== 0 ? 'border-left:1px solid #cecece' : ''}" >

            <div class="row">
                <span class="icon">${this.getIconStep(step.status)}</span>

                <span class="title">
                    ${this.getTitle(step)}
                </span>

                <span class="actions">
                    <a href="#" @click=${(e: MouseEvent) => { e.preventDefault(); this.selectedStep = step; }}>
                        details
                    </a>
                    <a href="#"
                        @click=${(e: MouseEvent) => {
                e.preventDefault();
                this.selectedTraceStep = step;
            }}>
                        trace
                    </a>
                </span>
            </div>

            ${hasChildren
                ? children.map((s: any) =>
                    this.renderStep(s, depth + 1)
                )
                : nothing}
        </div>
    `;
    }

    private renderTaskRootDetails() {
        if (!this.task) return html``;
        return html`
            <div class="row">
                <span class="icon">${this.getIconTask(this.task.status)}</span>
                <div>${this.task?.title}</div>
                ${this.renderActions()}
            </div>
            <hr></hr>

        `
    }

    private renderActions() {
        const task = this.task;
        if (!task) return nothing;

        const queue = task.iaCompressed?.queueFrontEnd;

        const showRestart = task.status === 'in progress' && !queue?.length;
        const showPause = task.status === 'in progress';
        const showContinue = task.status === 'paused';

        // ${showRestart ? html`<span class="icon" @click=${this.restartPoolingTask} >${collab_play} </span>` : nothing}

        return html`
        <div class="actions">
            ${showPause || showContinue ? html`<span class="icon" @click=${() => { this.pauseOrContinueTask(showPause ? 'paused' : 'continue') }} >${showPause ? this.collab_pause : this.collab_play} </span>` : nothing}
            
            
        </div>
    `;
    }

    private pauseOrContinueTask(action: "paused" | "continue") {
        if (!this.task || !this.message) return;
        const context: mls.msg.ExecutionContext = { message: this.message, task: this.task, isTest: false };
        pauseOrContinueTask('user request', context, action)
    }

    private restartPoolingTask() {
        if (!this.task || !this.message) return;
        const context: mls.msg.ExecutionContext = { message: this.message, task: this.task, isTest: false };
        continuePoolingTask(context);
    }

    private renderTaskProgress() {
        if (!this.task) return html``;
        if (this.task.status !== 'in progress') return html``;

        const root = this.task.iaCompressed?.nextSteps[0];
        if (!root?.progress) return html``;

        const { completed, failed, total } = root.progress;

        const percent = total ? Math.round((completed / total) * 100) : 0;

        const stateClass =
            failed > 0
                ? 'failed'
                : percent === 100
                    ? 'done'
                    : 'running';

        return html`
            <div class="progress">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>
                        ${completed}/${total}
                        ${failed > 0 ? html` • ❌ ${failed}` : nothing}
                    </span>
                </div>

                <div class="bar">
                    <div
                        class="fill ${stateClass}"
                        style="width:${percent}%"
                    ></div>
                </div>
            </div>
        `;
    }

    private renderTree() {
        const steps = this.task?.iaCompressed?.nextSteps ?? [];
        return html`
        <section class="tree">
                ${this.renderTaskRootDetails()}
                ${this.isAgentParallelMode ? this.renderTaskProgress() : ''}
                ${steps.map((s: any) => this.renderStep(s))}
        </section>
            `;
    }

    private renderDetails() {

        const step = JSON.parse(JSON.stringify(this.selectedStep)) as mls.msg.AIPayload;
        if (step && step.nextSteps) step.nextSteps = [];
        if (step && step.interaction && step.interaction.payload) {
            step.interaction.payload.forEach((pay) => {
                pay.nextSteps = [];
            });
        }

        return html`
            <section class="details">
                <a 
                    class="back"
                    href = "#"
                    @click=${(e: MouseEvent) => { e.preventDefault(); this.selectedStep = null }}>
                    ← back
                </a>
                <h3> ${this.getTitle(step)} </h3>
                <pre> ${JSON.stringify(step, null, 2)} </pre>
            </section>
                        `;
    }



    private renderTrace() {
        const step = this.selectedTraceStep;

        if (!step) return nothing;

        const logs = (step as mls.msg.AIPayload).interaction?.trace ?? [];

        return html`
            <section class="trace">
                <a 
                    class="back"
                    href = "#"
                    @click=${(e: MouseEvent) => {
                e.preventDefault();
                this.selectedTraceStep = null;
            }
            }>
                ← back
            </a>

            <h3> Trace • ${this.getTitle(step)} </h3>

            ${logs.length === 0
                ? html`<div>No logs</div>`
                : html`
                    <ul class="log-list">
                        ${logs.map((l: unknown) => html`
                        <li class="log-item">
                            ${this.renderLogItem(l)}
                        </li>
                    `)}
                    </ul>
                `}
        </section>
            `;
    }

    private renderLogItem(raw: unknown) {

        const data = this.tryParseJSON(raw);

        if (typeof data === 'object' && data !== null) {
            const obj = data as any;

            return html`
            <div class="log-card">
                ${obj.title ?
                    html`<div> ${this.getIconStep(obj.ok ? 'completed' : 'failed')} <strong>${obj.title}</strong></div>`
                    : nothing}
                <pre>${JSON.stringify(obj, null, 2)}</pre>
            </div>
        `;
        }

        return html`<pre>${String(data)}</pre>`;
    }


    private tryParseJSON(value: unknown) {
        if (typeof value !== 'string') return value;

        try {
            return JSON.parse(value);
        } catch {
            return value; // continua string normal
        }
    }



    render() {

        if (!this.task) return html`No find task`;
        if (!this.task.iaCompressed) return html`No find Ai interaction in task`;
        return html`
            <section class="feedback-section">
                ${this.selectedTraceStep
                ? this.renderTrace()
                : this.selectedStep
                    ? this.renderDetails()
                    : this.renderTree()
            }
        </section>
            `;
    }

    private iconError = svg`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="256" height="256" viewBox="0 0 256 256" xml:space="preserve" fill="currentColor">
<g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
	<path d="M 24.959 68.04 c -0.768 0 -1.536 -0.293 -2.121 -0.879 c -1.172 -1.171 -1.172 -3.071 0 -4.242 l 40.081 -40.081 c 1.172 -1.172 3.07 -1.172 4.242 0 c 1.172 1.171 1.172 3.071 0 4.242 L 27.081 67.161 C 26.495 67.747 25.727 68.04 24.959 68.04 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: currentColor; fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round"/>
	<path d="M 65.04 68.04 c -0.768 0 -1.535 -0.293 -2.121 -0.879 L 22.838 27.081 c -1.172 -1.171 -1.172 -3.071 0 -4.242 c 1.171 -1.172 3.071 -1.172 4.242 0 l 40.081 40.081 c 1.172 1.171 1.172 3.071 0 4.242 C 66.575 67.747 65.808 68.04 65.04 68.04 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: currentColor; fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round"/>
		<rect
			x="0"
			y="0"
			width="90"
			height="90"
			rx="25"
			fill="none"
			stroke="currentColor"
			stroke-width="6"
		/>
</g>
</svg>`;

    private iconPending = svg`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="256" height="256" viewBox="0 0 256 256" xml:space="preserve" fill="currentColor">
<g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
	<rect
			x="0"
			y="0"
			width="90"
			height="90"
			rx="25"
			fill="none"
			stroke="currentColor"
			stroke-width="6"
		/>
</g>
</svg>`;


    private iconTaskPaused = svg`
        <svg xmlns="http://www.w3.org/2000/svg"
            width="256"
            height="256"
            viewBox="0 0 256 256"
            fill="currentColor">

            <g
                style="stroke: none; stroke-width: 0; fill: none;"
                transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">

                <!-- contorno externo (idêntico ao pending) -->
                <rect
                    x="0"
                    y="0"
                    width="90"
                    height="90"
                    rx="25"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="6"
                />

                <!-- pause -->
                <rect x="30" y="24" width="8" height="42" rx="2" fill="currentColor"/>
                <rect x="52" y="24" width="8" height="42" rx="2" fill="currentColor"/>

            </g>
        </svg>
    `;


    private iconOk = svg`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>45-Check</title><g id="_45-Check" data-name="45-Check"><path d="M30,15V25a5,5,0,0,1-5,5H7a5,5,0,0,1-5-5V7A5,5,0,0,1,7,2H17V0H7A7,7,0,0,0,0,7V25a7,7,0,0,0,7,7H25a7,7,0,0,0,7-7V15Z"/><path d="M7.71,13.29,6.29,14.71l7,7a1,1,0,0,0,1.41,0l16-16L29.29,4.29,14,19.59Z"/></g></svg></div>`


    private iconWaitingHumam = svg`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g data-name="18-Clock"><path d="M2 18a12 12 0 0 1 23.08-4.62l1.85-.77A14 14 0 0 0 16 4.14V2h1a2 2 0 0 0 2-2l-8 .06A.22.22 0 0 1 11 0H9a2 2 0 0 0 2 2h1v2.16A14 14 0 0 0 14 32v-2A12 12 0 0 1 2 18z"/><path d="M15 11h-2v7a1 1 0 0 0 .29.71l3 3 1.41-1.41-2.7-2.71zM31 27.23V24a6 6 0 0 0-5-5.91V17h-2v1.09A6 6 0 0 0 19 24v3.23A1.89 1.89 0 0 0 18 29l2-.1a.15.15 0 0 1-.15.1h2.33a3 3 0 0 0 5.63 0H32a1.89 1.89 0 0 0-1-1.77zM29 27h-8v-3a4 4 0 0 1 8 0z"/></g></svg>`;

    private iconWaitingAfter = svg`<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 25 25"><defs></defs><g id="clock_1" data-name="clock 1"><path class="cls-1" d="M12.5 1A11.5 11.5 0 1 0 24 12.5 11.51 11.51 0 0 0 12.5 1zm0 22A10.5 10.5 0 1 1 23 12.5 10.51 10.51 0 0 1 12.5 23z"/><path class="cls-1" d="M13 12.6V5.5a.5.5 0 0 0-1 0v7.32a.48.48 0 0 0 .16.36l5 4.68a.45.45 0 0 0 .34.14.5.5 0 0 0 .34-.86z"/></g></svg>`;

    private collab_bell = svg`<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 448 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M224 0c-17.7 0-32 14.3-32 32l0 19.2C119 66 64 130.6 64 208l0 18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416l384 0c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8l0-18.8c0-77.4-55-142-128-156.8L256 32c0-17.7-14.3-32-32-32zm45.3 493.3c12-12 18.7-28.3 18.7-45.3l-64 0-64 0c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7z"/> </svg>`;

    private collab_play = svg`
    <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 384 512"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>
`;

    private collab_pause = svg`
    <svg width="14" height="14" viewBox="0 0 320 512" fill="currentColor"><!--!Font Awesome Free 6.5.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/></svg>
`;



}


