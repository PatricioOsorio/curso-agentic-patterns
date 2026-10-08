import { generateText } from 'ai';
import { createTracer, log, model } from '../../helpers/index.js';

const QUESTION =
  '¿Cuánto costarían juntos el curso de TypeScript y el de Docker ' +
  'con un 20% de descuento? Dame también las horas totales.';

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

export async function toolUseMain() {
  const firstResult = await withoutTools();

  log.title('Comparativa');
  console.table({
    'sin herramientas': firstResult,
  });
}
