/**
 * PATRÓN: Reflexión - Reflection
 * ------------------------------
 * El modelo evalúa su propia salida y la refina.
 *
 * La trampa del patrón: un modelo que se auto-evalúa SIN criterios
 * tiende a aprobarse. Este laboratorio lo demuestra en tres rondas:
 *
 *   A) Sin reflexión         → una sola pasada
 *   B) Reflexión ingenua     → "¿está bien?" → casi siempre dice que sí
 *   C) Reflexión con rúbrica → criterios explícitos → mejora real
 *
 * El juez programático del final es la pieza clave: dice la verdad
 * aunque el modelo se haya dado el visto bueno a sí mismo.
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createTracer, log, model, withSkills, xmlTag } from '../../helpers/index.js';

// ---------------------------------------------------------------------------
// LA TAREA
// ---------------------------------------------------------------------------

const VILLAIN_DOSSIER = [
  'EXPEDIENTE: Mirror Master',
  '  Nombre real: Evan McCulloch',
  '  Poder: viaja por la dimensión espejo; puede extraer a otros de sus celdas',
  '  Debilidad: los espejos requieren superficie reflectante intacta',
  '  Última ubicación: distrito industrial, almacén 7',
  '  Cómplices conocidos: Killgrave',
  '  Recompensa: 250.000 USD',
].join('\n');

/**
 * Seis requisitos, todos verificables sin criterio subjetivo.
 * Que sean comprobables por código es lo que hace honesto al lab:
 * no dependemos de que el modelo diga si mejoró.
 */
const REQUIREMENTS = [
  'Menciona el nombre real del villano',
  'Indica una contramedida concreta basada en su debilidad',
  'Especifica la última ubicación conocida',
  'Nombra a sus cómplices',
  'Incluye el monto exacto de la recompensa',
  'Termina con una línea que empiece por "RIESGO:" (sin markdown)',
  'No respondas en markdown',
];

// Tarea base sin slash commands (para el flujo autónomo por defecto)
const TASK =
  'Redacta un briefing operativo para el equipo de captura, de máximo 120 palabras.\n' +
  'Sé sumamente directo, conciso y sin formalismos ni rodeos innecesarios.\n\n' +
  'REQUISITOS OBLIGATORIOS:\n' +
  REQUIREMENTS.map((requirement, i) => `  ${i + 1}. ${requirement}`).join('\n') +
  '\n\n' +
  VILLAIN_DOSSIER;

// ---------------------------------------------------------------------------
// EL JUEZ PROGRAMÁTICO — la fuente de verdad del laboratorio
// ---------------------------------------------------------------------------

type Check = { label: string; passed: boolean };

/**
 * Verificación determinista. No usa el modelo: por eso no se deja engañar
 * cuando el modelo afirma que su propio texto "cumple todo".
 */
function auditBriefing(text: string): Check[] {
  const lower = text.toLowerCase();

  return [
    { label: 'Nombre real', passed: lower.includes('mcculloch') },
    {
      label: 'Contramedida',
      passed: /espejo|reflectante|superficie/.test(lower),
    },
    {
      label: 'Ubicación',
      passed: /almac[eé]n\s*7|distrito industrial/.test(lower),
    },
    { label: 'Cómplices', passed: lower.includes('killgrave') },
    { label: 'Recompensa', passed: /250[.,]?000/.test(text) },
    { label: 'Línea RIESGO:', passed: /^RIESGO:/m.test(text) },
    { label: '≤ 120 palabras', passed: text.trim().split(/\s+/).length <= 120 },
  ];
}

function printAudit(checks: Check[]) {
  const passed = checks.filter((check) => check.passed).length;

  for (const check of checks) {
    const mark = check.passed ? '✓'.green : '✗'.red;
    console.log(`     ${mark} ${check.label}`);
  }
  console.log(`     → ${passed}/${checks.length} requisitos cumplidos`.blue);

  return passed;
}

// ---------------------------------------------------------------------------
// A) SIN REFLEXIÓN — una sola pasada
// ---------------------------------------------------------------------------

async function withoutReflection() {
  log.title('A) Sin reflexión (Skills autónomas por defecto)');
  const tracer = createTracer('sin-reflexión');

  const { text } = await generateText({
    model,
    ...withSkills(TASK, 'Eres un redactor táctico de briefings de seguridad.'),
    ...tracer.callbacks,
  });

  log.info('Texto generado', '\n' + text);

  log.section('Auditoría de requisitos');

  const score = printAudit(auditBriefing(text));

  return { ...tracer.summary(), score };
}

// ---------------------------------------------------------------------------
// B) REFLEXIÓN INGENUA — el modelo se pregunta "¿está bien?"
// ---------------------------------------------------------------------------

const naiveReflectionSchema = z.object({
  isGoodEnough: z.boolean().describe('¿El texto generado es suficientemente bueno?'),
  comment: z.string().describe('Comentario sobre la calidad del texto y posibles mejoras.'),
});

async function naiveReflection() {
  log.title('B) Reflexión ingenua (Skills autónomas por defecto)');
  const tracer = createTracer('naive-reflection');

  const { text: draft } = await generateText({
    model,
    ...withSkills(TASK, 'Eres un redactor táctico de briefings de seguridad.'),
    ...tracer.callbacks,
  });

  // autoevaluacion (sin skill de redacción para no sesgar la evaluación estructurada)
  const { output: feedback } = await generateText({
    model,
    output: Output.object({
      schema: naiveReflectionSchema,
    }),
    instructions:
      'Eres un revisor de textos. Evalúa el briefing operativo incluido en <draft> y responde con un breve feedback:',
    prompt: xmlTag('draft', draft),

    ...tracer.callbacks,
  });

  log.section('Borrador');
  log.info('Texto generado', '\n' + draft);

  log.section('Autoevaluación del modelo');
  if (feedback.isGoodEnough) {
    log.success('¿Es suficientemente bueno?', 'Sí');
  } else {
    log.warn('¿Es suficientemente bueno?', 'No');
  }
  log.info('Comentario del modelo', feedback.comment);

  log.section('Auditoría del juez programático');
  const score = printAudit(auditBriefing(draft));

  return { ...tracer.summary(), score };
}

// ---------------------------------------------------------------------------
// C) REFLEXIÓN CON RÚBRICA — criterios explícitos e iteración
// ---------------------------------------------------------------------------
const missingSchema = z.object({
  requirementNumber: z.number().describe('Número del requisito que no se cumple'),
  description: z.string().describe('Breve descripción de lo que falta en el requisito'),
  isPassed: z.boolean(),
});

const criteriaSchema = z.object({
  missing: z
    .array(missingSchema)
    .describe(
      'Requisitos que no se cumplen en el texto. citando el numero de cada uno y una breve descripción de lo que falta'
    ),
  isCompleted: z.boolean().describe('true solo si TODOS los requisitos se cumplen'),
});

const MAX_ITERATIONS = 3;

async function reflectionWithRubric() {
  log.title('C) Reflexión con rúbrica (Skill forzada con /caveman)');
  const tracer = createTracer('con-rúbrica-reflexión');

  let draft = '';
  let iteration = 0;

  // Inyección forzada directa mediante /caveman
  const { text: firstDraft } = await generateText({
    model,
    ...withSkills(`/caveman ${TASK}`, 'Eres un redactor táctico de briefings de seguridad.'),
    ...tracer.callbacks,
  });

  draft = firstDraft;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    log.section(`Iteración ${iteration} de ${MAX_ITERATIONS}`);

    const { output: criteria } = await generateText({
      model,
      output: Output.object({
        schema: criteriaSchema,
      }),
      instructions:
        'Eres un revisor estricto. Verifica el contenido de <draft> paso a paso contra cada <requirement> en <requirements>. No asumas que algo está bien si no lo has verificado en el texto.\n' +
        '- Para el requisito de "RIESGO:": la línea debe empezar estrictamente por "RIESGO:". Si usa formato markdown como "**RIESGO:**", repórtalo en "missing".\n' +
        '- Si el texto excede 120 palabras, repórtalo en "missing".',
      prompt: [
        xmlTag(
          'requirements',
          REQUIREMENTS.map((r, i) => xmlTag('requirement', r, { number: i + 1 }))
        ),
        xmlTag('draft', draft),
      ].join('\n\n'),
      ...tracer.callbacks,
    });

    const missing = criteria.missing
      .filter((r) => !r.isPassed)
      .map((r) => `Requisito ${r.requirementNumber}: ${r.description}`);

    if (criteria.isCompleted && missing.length === 0) {
      log.success('Revisión completada', 'Todos los requisitos fueron cumplidos');
      break;
    }

    log.warn(`Requisitos pendientes (${missing.length})`);
    missing.forEach((r) => log.warn('Falta', r));

    // Reescritura conservando la skill forzada de /caveman
    const { text: newDraft } = await generateText({
      model,
      ...withSkills(
        '/caveman Reescribe el briefing corrigiendo las deficiencias.',
        [
          'Eres un redactor táctico de briefings de seguridad.',
          'Reescribe el briefing de <original-briefing> corrigiendo únicamente las deficiencias señaladas en <missing-requirements>. Utiliza los datos de <context>. Conserva lo que ya funcionaba.',
          'La última línea debe ser exactamente "RIESGO: [descripción]" sin asteriscos ni negritas.',
        ].join('\n\n')
      ),
      prompt: [
        xmlTag('original-briefing', draft),
        xmlTag(
          'missing-requirements',
          missing.map((r) => xmlTag('item', r))
        ),
        xmlTag('context', VILLAIN_DOSSIER),
      ].join('\n\n'),
      ...tracer.callbacks,
    });

    draft = newDraft;
  }

  log.section('Resultado final');
  log.info('Iteraciones realizadas', iteration);
  log.info('Texto final', '\n' + draft);

  log.section('Auditoría de requisitos');
  const score = printAudit(auditBriefing(draft));

  return { ...tracer.summary(), score, number_iterations: iteration };
}

// ---------------------------------------------------------------------------
// EJECUCIÓN DEL PROGRAMA
// ---------------------------------------------------------------------------

export async function reflectionMain() {
  // const withoutReflectionResponse = await withoutReflection();
  // const naiveReflectionResponse = await naiveReflection();
  const reflectionWithRubricResponse = await reflectionWithRubric();

  log.title('Comparativa');
  console.table({
    // 'Sin reflexión': withoutReflectionResponse,
    // 'Reflexión ingenua': naiveReflectionResponse,
    'Reflexión con rúbrica': reflectionWithRubricResponse,
  });

  console.log(
    '\n  La reflexión ingenua cuesta tokens extra y casi no mejora nada:\n' +
      '  el modelo se aprueba a sí mismo.\n\n' +
      '  Reflexionar no sirve por reflexionar. Sirve cuando hay criterios\n' +
      '  concretos contra los que comparar.\n\n' +
      '  Y aun así, el revisor sigue siendo el mismo modelo que escribió.\n' +
      '  Separar los roles en dos agentes es el patrón Evaluator-Optimizer.\n'
  );
}
