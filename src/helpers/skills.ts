import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stepCountIs, tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { xmlTag } from './xml-tag.js';

const SKILLS_DIR = join(process.cwd(), '.agents/skills');

export interface SkillMeta {
  name: string;
  description: string;
}

export interface ResolvedSkillPrompt {
  isCommand: boolean;
  skillName: string | null;
  skillContent: string | null;
  prompt: string;
}

/**
 * Removes YAML frontmatter (--- ... ---) from skill Markdown content,
 * leaving only the actionable instructions for the LLM.
 */
export function cleanSkillFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\n*/, '').trim();
}

/**
 * Reads and cleans a skill's instructions from disk.
 * If raw is true, returns the unstripped file content.
 */
export function getSkillInstructions(skillName: string, raw = false): string {
  const path = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(path)) return '';
  const fileContent = readFileSync(path, 'utf-8');
  return raw ? fileContent : cleanSkillFrontmatter(fileContent);
}

/**
 * Scans .agents/skills/ and extracts metadata (Tier 1: Index).
 * Only reads name and description without loading the full instruction bodies.
 */
export function getAvailableSkills(): SkillMeta[] {
  if (!existsSync(SKILLS_DIR)) return [];

  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((dir) => {
      const filePath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (!existsSync(filePath)) return null;

      const raw = readFileSync(filePath, 'utf-8');
      const nameMatch = raw.match(/^name:\s*([^\n]+)/m);
      const descMatch = raw.match(/^description:\s*(?:>|>-)?\s*([^\n]+(?:\n\s+[^\n]+)*)/m);

      const description = descMatch
        ? descMatch[1]
            .split('\n')
            .map((line) => line.trim())
            .join(' ')
            .replace(/^['"]|['"]$/g, '')
        : '';

      return {
        name: nameMatch ? nameMatch[1].trim() : dir.name,
        description,
      };
    })
    .filter((s): s is SkillMeta => s !== null);
}

/**
 * Formats the available skills index as an XML block for progressive disclosure.
 */
export function renderSkillsIndex(): string {
  const skills = getAvailableSkills();
  if (skills.length === 0) return '';

  const items = skills.map((s) => `  <skill name="${s.name}">${s.description}</skill>`);
  return xmlTag('available-skills', items);
}

/**
 * Resolves a prompt for slash commands (e.g., "/caveman Redacta un briefing...").
 * If a command is detected and matches an installed skill, extracts the skill content
 * and separates it from the user prompt.
 */
export function resolveSkillPrompt(input: string): ResolvedSkillPrompt {
  const match = input.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) {
    return {
      isCommand: false,
      skillName: null,
      skillContent: null,
      prompt: input,
    };
  }

  const [, commandName, remainingPrompt] = match;
  const content = getSkillInstructions(commandName);

  if (!content) {
    return {
      isCommand: false,
      skillName: null,
      skillContent: null,
      prompt: input,
    };
  }

  return {
    isCommand: true,
    skillName: commandName,
    skillContent: content,
    prompt: remainingPrompt?.trim() || '',
  };
}

/**
 * Progressive disclosure tool: allows the LLM to dynamically load a skill on demand.
 */
export const readSkillTool = tool({
  description:
    'Lee las directrices operativas completas de una habilidad disponible en .agents/skills/ cuando sea requerida.',
  inputSchema: z.object({
    skillName: z.string().describe('Nombre de la habilidad a consultar (ej: "caveman", "ai-sdk")'),
  }),
  execute: async ({ skillName }) => {
    const content = getSkillInstructions(skillName);
    return content || `Habilidad "${skillName}" no encontrada.`;
  },
});

/**
 * Configures skill context for generateText in a single spread:
 * - If the prompt includes a slash command (/caveman), injects that skill directly.
 * - Otherwise, provides the skills index and readSkillTool by default.
 */
export function withSkills(input: string, baseInstructions = '') {
  const { isCommand, skillName, skillContent, prompt } = resolveSkillPrompt(input);

  if (isCommand && skillContent) {
    return {
      prompt,
      instructions: [
        baseInstructions,
        xmlTag('skill', skillContent, { name: skillName! }),
      ]
        .filter(Boolean)
        .join('\n\n'),
      tools: {} as ToolSet,
    };
  }

  return {
    prompt,
    instructions: [
      baseInstructions,
      'Tienes habilidades especializadas disponibles. Si la tarea coincide con alguna de ellas, consúltala con readSkillTool antes de responder:',
      renderSkillsIndex(),
    ]
      .filter(Boolean)
      .join('\n\n'),
    tools: { readSkillTool } as ToolSet,
    stopWhen: stepCountIs(4),
  };
}
