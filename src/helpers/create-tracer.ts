import { inspect as nodeInspect } from 'node:util';
import type {
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from 'ai';

export interface TracerOptions {
  /** If true, prints full payloads without truncating */
  verbose?: boolean;
}

export interface TracerSummary {
  steps: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
}

/** Formats values with syntax highlighting for deep debugging */
export function inspect(value: unknown, depth = 5): string {
  return nodeInspect(value, {
    depth,
    colors: true,
    compact: false,
    breakLength: 80,
  });
}

export function createTracer(rawLabel: string, options: TracerOptions = {}) {
  // Normalize label in case caller passes '[label]'
  const cleanLabel = rawLabel.replace(/^\[+|\]+$/g, '');

  const startTime = performance.now();
  let stepCount = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;
  let stepStarted = false;

  const formatText = (text: string, maxLen = 180): string => {
    const trimmed = text.trim();
    if (options.verbose || trimmed.length <= maxLen) {
      return trimmed;
    }
    return `${trimmed.slice(0, maxLen)}... [truncated]`;
  };

  const formatData = (data: unknown, maxLen = 180): string => {
    if (options.verbose) {
      return `\n${inspect(data)}`;
    }
    const json = JSON.stringify(data);
    if (json.length <= maxLen) {
      return json;
    }
    return `${json.slice(0, maxLen)}... [truncated]`;
  };

  const onStepStart = (event: GenerateTextStepStartEvent) => {
    stepStarted = true;
    const stepNumber = event.stepNumber + 1;
    console.log(
      `\n  ┌─ [${cleanLabel.blue}] ${`step ${stepNumber}`.yellow} · ${'calling model...'.purple}`,
    );
  };

  const onToolExecutionStart = (event: ToolExecutionStartEvent) => {
    console.log(
      `  │  ${'⚡ TOOL RUN'.yellow} → ${event.toolCall.toolName.blue}(${formatData(event.toolCall.input)})`,
    );
  };

  const onToolExecutionEnd = (event: ToolExecutionEndEvent) => {
    const duration = `${event.toolExecutionMs}ms`.yellow;
    console.log(
      `  │  ${'⚡ TOOL DONE'.green}← ${event.toolCall.toolName.blue} · ${duration}`,
    );
  };

  const onStepEnd = (event: GenerateTextStepEndEvent) => {
    stepCount = Math.max(stepCount, event.stepNumber + 1);

    const tokens = event.usage?.totalTokens ?? 0;
    const inputTokens = event.usage?.inputTokens ?? 0;
    const outputTokens = event.usage?.outputTokens ?? 0;

    totalTokens += tokens;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalToolCalls += event.toolCalls.length;

    // If onStepStart wasn't wired by caller, print the step header here
    if (!stepStarted) {
      console.log(
        `\n  ┌─ [${cleanLabel.blue}] ${`step ${event.stepNumber + 1}`.yellow}`,
      );
    }
    stepStarted = false;

    console.log(
      `  │  ${'METRICS'.purple}   → ${`${tokens} tokens`.purple} (in: ${inputTokens}, out: ${outputTokens}) · finish: ${event.finishReason.yellow}`,
    );

    if (event.reasoningText?.trim()) {
      console.log(
        `  │  ${'THINKING'.yellow}  → ${formatText(event.reasoningText)}`,
      );
    }

    for (const call of event.toolCalls) {
      console.log(
        `  │  ${'TOOL CALL'.blue} → ${call.toolName.blue}(${formatData(call.input)})`,
      );
    }

    for (const result of event.toolResults) {
      console.log(
        `  │  ${'TOOL RESULT'.green}← ${formatData(result.output)}`,
      );
    }

    if (event.text?.trim()) {
      console.log(`  │  ${'TEXT'.purple}       → ${formatText(event.text)}`);
    }

    console.log(`  └─`);
  };

  return {
    onStepStart,
    onStepEnd,
    // Alias for backward compatibility
    onStepFinish: onStepEnd,
    onToolExecutionStart,
    onToolExecutionEnd,

    // Convenient bundle to spread in generateText: ...tracer.callbacks
    callbacks: {
      onStepStart,
      onStepEnd,
      onToolExecutionStart,
      onToolExecutionEnd,
    },

    summary: (): TracerSummary => ({
      steps: stepCount,
      totalTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolCalls: totalToolCalls,
      durationMs: Math.round(performance.now() - startTime),
    }),
  };
}
