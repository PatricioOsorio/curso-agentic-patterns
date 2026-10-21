/**
 * PATRÓN: Planificación - Planning
 * --------------------------------
 * El modelo descompone la tarea en pasos ANTES de ejecutar.
 *
 * Sin planificación, el modelo intenta resolver todo de una vez y pierde
 * restricciones por el camino: manda un héroe que no contrarresta el poder
 * del villano, se pasa de las horas disponibles, o captura a un villano
 * después de que otro ya haya liberado a media prisión.
 *
 * Con planificación, cada paso resuelve una sola cosa y arrastra el
 * resultado al siguiente.
 *
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createTracer, log, model } from '../../helpers/index.js';
import { getSkillInstructions } from '../../tools/skills.js';

// ---------------------------------------------------------------------------
// LOS DATOS — el escenario
// ---------------------------------------------------------------------------

type Villain = {
  alias: string;
  power: string;
  /** Única especialidad capaz de neutralizarlo. */
  counteredBy: string;
  /** 1 = máxima prioridad. */
  threat: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /**
   * Puede liberar a los demás. NO se muestra en el texto del escenario:
   * el modelo debe deducirlo a partir del poder descrito.
   */
  freesOthers: boolean;
};

type Hero = {
  alias: string;
  specialty: string;
  /** Horas que puede operar antes de quedar fuera de combate. */
  availableHours: number;
};

const VILLAINS: Villain[] = [
  {
    alias: 'Mister Freeze',
    power: 'congela todo a su alrededor',
    counteredBy: 'fuego',
    threat: 1,
    freesOthers: false,
  },
  {
    alias: 'Killgrave',
    power: 'controla mentes con la voz',
    counteredBy: 'tecnología',
    threat: 2,
    freesOthers: false,
  },
  {
    alias: 'The Shade',
    power: 'se vuelve intangible en las sombras',
    counteredBy: 'luz',
    threat: 7,
    freesOthers: false,
  },
  {
    alias: 'Mirror Master',
    power: 'viaja por la dimensión espejo y puede sacar a otros de sus celdas',
    counteredBy: 'tecnología',
    threat: 3,
    freesOthers: true,
  },
  {
    alias: 'Solomon Grundy',
    power: 'regenera su cuerpo sin importar el daño recibido',
    counteredBy: 'luz',
    threat: 6,
    freesOthers: false,
  },
  {
    alias: 'Doctor Light',
    power: 'absorbe y redirige cualquier fuente de energía luminosa',
    counteredBy: 'luz',
    threat: 4,
    freesOthers: false,
  },
  {
    alias: 'Juggernaut',
    power: 'fuerza imparable, nada detiene su avance',
    counteredBy: 'telequinesis',
    threat: 5,
    freesOthers: false,
  },
];

const HEROES: Hero[] = [
  { alias: 'Antorcha Humana', specialty: 'fuego', availableHours: 6 },
  { alias: 'Green Lantern', specialty: 'luz', availableHours: 4 },
  { alias: 'Iron Man', specialty: 'tecnología', availableHours: 5 },
  { alias: 'Jean Grey', specialty: 'telequinesis', availableHours: 3 },
  { alias: 'Superman', specialty: 'fuego|luz', availableHours: 2 },
];

const SCENARIO_AS_TEXT = [
  'VILLANOS SUELTOS:',
  ...VILLAINS.map(
    (villain) =>
      `  ${villain.alias} | poder: ${villain.power} | ` +
      `solo lo detiene: ${villain.counteredBy} | amenaza: ${villain.threat}/7`
  ),
  '',
  'HÉROES DISPONIBLES:',
  ...HEROES.map(
    (hero) =>
      `  ${hero.alias} | especialidad: ${hero.specialty} | ` +
      `horas disponibles: ${hero.availableHours}`
  ),
].join('\n');

/**
 * VILLANOS SUELTOS:
 *   Mister Freeze | poder: congela todo a su alrededor | solo lo detiene: fuego | amenaza: 1/7
 *   Killgrave | poder: controla mentes con la voz | solo lo detiene: tecnología | amenaza: 2/7
 *   The Shade | poder: se vuelve intangible en las sombras | solo lo detiene: luz | amenaza: 7/7
 *   Mirror Master | poder: viaja por la dimensión espejo y puede sacar a otros de sus celdas | solo lo detiene: tecnología | amenaza: 3/7
 *   Solomon Grundy | poder: regenera su cuerpo sin importar el daño recibido | solo lo detiene: luz | amenaza: 6/7
 *   Doctor Light | poder: absorbe y redirige cualquier fuente de energía luminosa | solo lo detiene: luz | amenaza: 4/7
 *   Juggernaut | poder: fuerza imparable, nada detiene su avance | solo lo detiene: telequinesis | amenaza: 5/7
 *
 * HÉROES DISPONIBLES:
 *   Antorcha Humana | especialidad: fuego | horas disponibles: 6
 *   Green Lantern | especialidad: luz | horas disponibles: 4
 *   Iron Man | especialidad: tecnología | horas disponibles: 5
 *   Jean Grey | especialidad: telequinesis | horas disponibles: 3
 */

// ---------------------------------------------------------------------------
// EL PROBLEMA
// ---------------------------------------------------------------------------

/**
 * El enunciado cruza cuatro restricciones:
 *   1. Cada villano solo cae ante una especialidad concreta.
 *   2. Cada héroe tiene un límite de horas.
 *   3. Cada operación consume 2 horas del héroe asignado.
 *   4. Mirror Master DEBE ir primero, o el resto se vuelve a escapar.
 *
 * Resolver esto "de un tirón" casi siempre rompe alguna.
 */
const MISSION =
  'Se han fugado 7 villanos de la prisión de máxima seguridad. ' +
  'Diseña el operativo para recapturarlos a todos.\n\n' +
  'REGLAS:\n' +
  '  - Cada operación consume 2 horas del héroe asignado.\n' +
  '  - Los héroes pueden operar en paralelo; las horas son presupuesto individual.\n' +
  '  - Un héroe solo puede neutralizar villanos de su especialidad.\n' +
  '  - Ningún héroe puede exceder sus horas disponibles.\n' +
  '  - Atiende a los villanos por prioridad, donde 1 es el más urgente.\n' +
  '  - Si algún villano puede liberar a los demás, debe caer antes que nadie.\n' +
  '  - Si el operativo no es viable con los recursos disponibles, dilo.\n\n' +
  SCENARIO_AS_TEXT;

// ---------------------------------------------------------------------------
// A) SIN PLANIFICACIÓN — una sola llamada, todo de golpe
// ---------------------------------------------------------------------------
// TODO:
async function withoutPlanning() {
  log.title('A) SIN PLANIFICACIÓN');

  const tracer = createTracer('withoutPlanning');

  const { text } = await generateText({
    model,
    prompt: MISSION,
    ...tracer.callbacks,
  });

  log.info('Respuesta', text.green);

  console.log(
    (
      '\n  ⚠️  Verifica: ¿va Mirror Master primero?' +
      '\n      ¿cada héroe contrarresta de verdad el poder asignado?' +
      '\n      ¿son atrapados en orden de amenaza?' +
      '\n      ¿alguien supera sus horas disponibles?'
    ).yellow
  );

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// B) CON PLANIFICACIÓN — primero el plan, luego la ejecución
// ---------------------------------------------------------------------------
const stepSchema = z.object({
  goal: z.string().describe('Qué resuelve este paso, en una frase'),
  reason: z.string().describe('Por qué es necesario este paso, y por qué está en este orden'),
});

const planSchema = z.object({
  steps: z
    .array(stepSchema)
    .min(2)
    .max(10)
    .describe(
      'Lista de pasos ordenados para resolver la misión, donde cada paso resuelve una sola cosa y depende del anterior'
    ),
});

async function buildPlan(tracer: ReturnType<typeof createTracer>) {
  const cavemanSkill = getSkillInstructions('caveman');

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: planSchema,
    }),
    prompt: MISSION,
    instructions: [
      'Eres un experto en planificación de operaciones. No hagas las acciones aún. Cada operacion debe ser un paso ordenado, donde cada paso dependa del anterior.',
      cavemanSkill,
    ]
      .filter(Boolean)
      .join('\n\n'),
    ...tracer,
  });

  return output.steps;
}

async function withPlanning() {
  log.title('B) CON PLANIFICACIÓN');

  const tracer = createTracer('withPlanning');
  const cavemanSkill = getSkillInstructions('caveman');

  // 1) Generar el plan
  const steps = await buildPlan(tracer);

  // 2) Ejecutar paso a paso
  const findings: string[] = [];

  for (const [index, step] of steps.entries()) {
    log.info(`Paso ${index + 1}: ${step.goal}`.red);

    const { text } = await generateText({
      model,
      instructions: `Resuelve solo el paso indicado y no hagas nada más.`,
      prompt:
        `<mision-original>${MISSION}</mision-original>` +
        `<paso-actual>${step.goal}</paso-actual>` +
        `<razon>${step.reason}</razon>` +
        `<hallazgos-previos>${findings.join('\n')}</hallazgos-previos>`,
      ...tracer,
    });

    findings.push(`[${step.goal}]  \n ${text.trim()}`);
  }

  // 3) Sintetizar todos los pasos
  const { text: finalPlan } = await generateText({
    model,
    instructions: `Integra los resultados parciales en un plan final. No repitas los pasos, solo sintetiza los hallazgos.`,
    prompt: [
      `<mision-original>${MISSION}</mision-original>`,
      `<hallazgos>${findings.join('\n')}</hallazgos>`,
      cavemanSkill,
    ]
      .filter(Boolean)
      .join('\n'),
    ...tracer,
  });

  log.info('Plan final', finalPlan.green);

  return tracer.summary();
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
// TODO:
export async function planningMain() {
  // const withoutPlanningResponse = await withoutPlanning();
  const withPlanningResponse = await withPlanning();

  console.log('\n═══ COMPARATIVA ═══\n'.blue);
  console.table({
    // 'Sin planificación': withoutPlanningResponse,
    'Con planificación': withPlanningResponse,
  });

  console.log(
    '\n  Planificar cuesta más llamadas y más tokens.\n' +
      '  Lo que compra es que las restricciones sobrevivan hasta el final.\n' +
      '  Si no hay restricciones que perder, no compra nada.\n'
  );
}
