import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createTracer, log, model } from '../../helpers/index.js';

/**
 * PATRÓN: Uso de herramientas - Tool use
 * ---------------------------
 * El catálogo de cursos NO está en el entrenamiento
 * del modelo. Sin herramientas, el modelo inventa precios y cursos con
 * total confianza o en su defecto, no hace nada.
 * Con herramientas, consulta el dato real.
 */

// ---------------------------------------------------------------------------
//  LA "BASE DE DATOS" — datos que el modelo no puede conocer
// ---------------------------------------------------------------------------

type Course = {
  id: string;
  title: string;
  hours: number;
  priceUSD: number;
  level: 'basic' | 'intermediate' | 'advanced';
  students: number;
};

const COURSE_CATALOG: Course[] = [
  {
    id: 'ts-01',
    title: 'TypeScript desde cero',
    hours: 22,
    priceUSD: 19.99,
    level: 'basic',
    students: 48_120,
  },
  {
    id: 'nest-02',
    title: 'NestJS: API REST modular',
    hours: 31,
    priceUSD: 24.99,
    level: 'intermediate',
    students: 22_450,
  },
  {
    id: 'flu-03',
    title: 'Flutter: apps multiplataforma',
    hours: 46,
    priceUSD: 29.99,
    level: 'intermediate',
    students: 61_300,
  },
  {
    id: 'agt-04',
    title: 'Agentes de IA con TypeScript',
    hours: 18,
    priceUSD: 34.99,
    level: 'advanced',
    students: 1_890,
  },
  {
    id: 'dkr-05',
    title: 'Docker para desarrolladores',
    hours: 14,
    priceUSD: 17.99,
    level: 'basic',
    students: 35_770,
  },
];

const QUESTION =
  '¿Cuánto costarían juntos el curso de TypeScript y el de Docker ' +
  'con un 20% de descuento? Dame también las horas totales.';

// ! without tools
async function withoutTools() {
  const tracer = createTracer('withoutTools');
  const { text } = await generateText({
    model: model,
    prompt: QUESTION,
    ...tracer.callbacks,
  });

  log.title('Without tools');
  log.info('Respuesta', text.green);
  // log.warn('Verificar los números contra el catálogo de cursos');

  return tracer.summary();
}

// ! tool use pattern
const findCourses = tool({
  description:
    'Busca detalles en el catálogo de cursos de DevTalles, por texto, titulo, id o nivel. Utilizala siempre que necesites información de los cursos, estudiantes, precios, horas y niveles.',
  inputSchema: z.object({
    text: z.string().optional().describe('Texto a buscar en el catálogo de cursos'),
    level: z.enum(['basic', 'intermediate', 'advanced']).optional().describe('Nivel del curso'),
  }),
  execute: async ({ text, level }) => {
    const filteredCourses = COURSE_CATALOG.filter((c) => {
      const matchesText =
        !text ||
        c.title.toLowerCase().includes(text.toLowerCase()) ||
        c.id.toLowerCase().includes(text.toLowerCase());

      const matchesLevel = !level || c.level === level;

      return matchesText && matchesLevel;
    });

    return {
      length: filteredCourses.length,
      data: filteredCourses,
    };
  },
});

// ! with tools
async function withTools() {
  const tracer = createTracer('withTools');
  const { text } = await generateText({
    model: model,
    prompt: QUESTION,
    tools: {
      findCourses,
    },
    stopWhen: stepCountIs(6), // circuit breaker
    instructions: `Eres un asistente de la plataforma de cursos Devtalles, no inventes precios, cursos, horas ni niveles. Si no sabes la respuesta, di que no lo sabes.`,
    ...tracer.callbacks,
  });

  log.title('With tools');
  log.info('Respuesta', text.green);
  // log.warn('Verificar los números contra el catálogo de cursos');

  return tracer.summary();
}

export async function toolUseMain() {
  const withoutToolsResult = await withoutTools();
  const withToolsResult = await withTools();

  log.title('Comparativa');
  console.table({
    'sin herramientas': withoutToolsResult,
    'con herramientas': withToolsResult,
  });
}
