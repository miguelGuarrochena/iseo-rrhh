import { NextRequest, NextResponse } from 'next/server';
import { consultarGemini, IANoConfigurada } from '@/lib/ia/gemini';

/**
 * Asistente del convenio colectivo. Recibe la pregunta y el contexto
 * (párrafos relevantes que el cliente ya recuperó del convenio) y responde
 * con IA basándose únicamente en ese texto.
 *
 * La API key de Gemini vive solo en el servidor (ver src/lib/ia/gemini.ts).
 */
export async function POST(req: NextRequest) {
  let pregunta = '';
  let contexto = '';
  try {
    const body = await req.json();
    pregunta = String(body?.pregunta ?? '').trim();
    contexto = String(body?.contexto ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  if (!pregunta) {
    return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 });
  }

  const prompt = [
    'Sos un asistente experto en convenios colectivos de trabajo de Argentina.',
    'Respondé la pregunta del usuario basándote EXCLUSIVAMENTE en los siguientes',
    'artículos del convenio. Si la respuesta no está en el texto, decilo con',
    'claridad y no inventes. Cuando puedas, citá el número de artículo. Sé breve',
    'y concreto, en español rioplatense.',
    '',
    '=== CONVENIO (artículos relevantes) ===',
    contexto || '(sin texto de convenio cargado)',
    '',
    `=== PREGUNTA ===`,
    pregunta,
    '',
    'Respuesta:',
  ].join('\n');

  try {
    const respuesta = await consultarGemini(prompt);
    return NextResponse.json({ respuesta });
  } catch (e) {
    if (e instanceof IANoConfigurada) {
      return NextResponse.json(
        { error: 'IA no configurada. Falta la API key de Gemini.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'No pudimos consultar la IA. Probá de nuevo.' },
      { status: 500 }
    );
  }
}
