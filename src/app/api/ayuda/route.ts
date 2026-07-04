import { NextRequest, NextResponse } from 'next/server';
import { consultarGemini, IANoConfigurada } from '@/lib/ia/gemini';

/**
 * Asistente de ayuda de ISEO RH. Responde dudas de uso de la app basándose
 * en la base de conocimiento (FAQ) que el cliente envía como contexto.
 * La API key de Gemini vive solo en el servidor (ver src/lib/ia/gemini.ts).
 */
export async function POST(req: NextRequest) {
  let pregunta = '';
  let contexto = '';
  let rol = '';
  try {
    const body = await req.json();
    pregunta = String(body?.pregunta ?? '').trim();
    contexto = String(body?.contexto ?? '').trim();
    rol = String(body?.rol ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  if (!pregunta) {
    return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 });
  }

  const prompt = [
    'Sos el asistente de ayuda de ISEO RH, una plataforma de gestión de',
    'Recursos Humanos para PyMEs. Ayudás a la persona a usar la app.',
    'Respondé SOLO sobre cómo usar la aplicación, basándote en la siguiente',
    'guía. Si la pregunta no está cubierta, decilo y sugerí contactar a RRHH o',
    'a soporte. Sé breve, claro y en español rioplatense.',
    rol ? `\nRol de quien pregunta: ${rol}.` : '',
    '',
    '=== GUÍA DE AYUDA ===',
    contexto || '(sin guía)',
    '',
    '=== PREGUNTA ===',
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
      { error: 'No pudimos consultar el asistente. Probá de nuevo.' },
      { status: 500 }
    );
  }
}
