import 'server-only';

/**
 * Envío de mails vía Resend (https://resend.com). Solo servidor.
 * Necesita RESEND_API_KEY y EMAIL_FROM (ej. "ISEO RH <avisos@iseo-rh.com>")
 * en las variables de entorno. Si faltan, no rompe: devuelve false y avisa.
 */
export const enviarEmail = async (opciones: {
  para: string[];
  asunto: string;
  html: string;
}): Promise<boolean> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn('Resend sin configurar (RESEND_API_KEY / EMAIL_FROM).');
    return false;
  }
  if (opciones.para.length === 0) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: opciones.para,
        subject: opciones.asunto,
        html: opciones.html,
      }),
    });
    if (!res.ok) {
      console.error('Resend respondió con error:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('No se pudo enviar el mail:', err);
    return false;
  }
};
