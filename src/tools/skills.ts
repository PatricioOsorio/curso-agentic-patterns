import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';

const SKILLS_DIR = join(process.cwd(), '.agents/skills');

/**
 * Carga el contenido completo de una skill para inyección directa en el prompt/instructions.
 */
export function getSkillInstructions(skillName: string): string {
  const path = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}

/**
 * Tool agnóstica para permitir carga bajo demanda (Progressive Disclosure) si un agente la requiere.
 */
export const readSkillTool = tool({
  description: 'Lee las directrices de una skill instalada en .agents/skills/',
  inputSchema: z.object({
    skillName: z.string().describe('Nombre de la carpeta de la skill'),
  }),
  execute: async ({ skillName }) => {
    const content = getSkillInstructions(skillName);
    return content || `Skill "${skillName}" no encontrada.`;
  },
});
