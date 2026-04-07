// supabase/functions/send-report/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@1.0.0'

// Headers de CORS para permitir la comunicación
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Placeholder para la generación del PDF (se mantiene igual)
async function generatePdfPlaceholder(reportTitle: string): Promise<Uint8Array> {
  const text = `Este es un PDF de prueba generado para el reporte: ${reportTitle}`;
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

serve(async (req) => {
  // Manejo de la solicitud pre-vuelo (preflight) de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener la clave de API de Resend desde los secretos
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY no está configurada en los secretos de Supabase.')
    }
    const resend = new Resend(resendApiKey);

    // Obtener los datos del cuerpo de la solicitud
    const { to, subject, note, filters } = await req.json()
    if (!to || !subject) {
      throw new Error("Los campos 'to' y 'subject' son requeridos.");
    }

    // Generar el PDF en el servidor
    const pdfBuffer = await generatePdfPlaceholder(subject);

    // Enviar el correo con Resend
    const { data, error } = await resend.emails.send({
      from: 'InfoGastos <onboarding@resend.dev>',
      to: to,
      subject: subject,
      html: `<p>${note || 'Adjunto se encuentra el reporte solicitado.'}</p>`,
      attachments: [
        {
          filename: `Reporte_Operativo_${new Date().toISOString().split('T')[0]}.pdf`,
          content: Buffer.from(pdfBuffer), // Es más seguro convertir a Buffer
        },
      ],
    });

    if (error) {
      // Si Resend devuelve un error, lo lanzamos para que se capture abajo
      throw error;
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    // Capturamos cualquier error (de Resend, de JSON, etc.) y lo devolvemos
    // con un mensaje claro.
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})