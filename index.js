const venom = require('venom-bot');
const fetch = require('node-fetch');

// --- CONFIGURACIÓN PERSONALIZADA ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TU_NUMERO = '51994058951@c.us'; // ✅ Tu número
const TU_NOMBRE = 'Miguel'; // ✅ Tu nombre

const CLIENTES = {};

// --- FUNCIÓN DE IA (GRATIS CON OPENROUTER) ---
async function getIAResponse(message) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "model": "mistralai/mistral-7b-instruct",
        "messages": [
          {"role": "system", "content": `Eres el asistente legal del abogado ${TU_NOMBRE}. Responde dudas de clientes que ya pagaron. Sé amable y profesional.`},
          {"role": "user", "content": message}
        ]
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error de IA:', error);
    return 'Lo siento, hubo un error. Por favor, intenta de nuevo.';
  }
}

// --- INICIAR BOT ---
venom.create({
  session: 'bot-legal-miguel',
  headless: true,
  multidevice: true
})
.then((client) => start(client))
.catch((error) => {
  console.log('❌ Error al iniciar el bot:', error);
});

// --- FUNCIÓN PRINCIPAL ---
function start(client) {
  console.log('🔥 BOT INICIADO! Esperando mensajes...');
  console.log(`📱 Número vinculado: ${TU_NUMERO}`);
  console.log(`👤 Abogado: ${TU_NOMBRE}`);

  client.onMessage(async (message) => {
    const from = message.from;
    const body = message.body ? message.body.toLowerCase().trim() : '';
    const isGroup = message.isGroupMsg;
    const isMedia = message.type === 'image';

    if (isGroup) return;

    if (!CLIENTES[from]) {
      CLIENTES[from] = { 
        etapa: 'inicio', 
        nombre: '', 
        pago_confirmado: false
      };
    }

    const cliente = CLIENTES[from];
    console.log(`📩 Mensaje de ${from}: ${body || '📎 Archivo'}`);

    try {
      // === PASO 1: NUEVO CLIENTE ===
      if (cliente.etapa === 'inicio') {
        await client.sendText(from, `👋 Hola, soy el asistente del abogado ${TU_NOMBRE}. Para comenzar, ¿me das tu nombre completo?`);
        cliente.etapa = 'esperando_nombre';
        return;
      }

      // === PASO 2: RECIBIR NOMBRE ===
      if (cliente.etapa === 'esperando_nombre') {
        if (!body || body.length < 2) {
          await client.sendText(from, '⚠️ Por favor, ingresa tu nombre completo.');
          return;
        }
        cliente.nombre = body;
        await client.sendText(from, `✅ Gracias, ${cliente.nombre}. Realiza el pago de S/.50 por Yape al 994058951 y envíame la captura.`);
        cliente.etapa = 'esperando_captura';
        return;
      }

      // === PASO 3: RECIBIR CAPTURA ===
      if (isMedia && cliente.etapa === 'esperando_captura') {
        await client.sendImage(
          TU_NUMERO, 
          message.body, 
          'captura.png', 
          `📸 NUEVO PAGO\nCliente: ${cliente.nombre}\nTeléfono: ${from}\n\n¿Confirmas? Responde "SÍ" o "NO"`
        );
        await client.sendText(from, '⏳ Captura recibida. Validando pago...');
        cliente.etapa = 'esperando_confirmacion';
        return;
      }

      // === PASO 4: TU CONFIRMACIÓN ===
      if (cliente.etapa === 'esperando_confirmacion' && from === TU_NUMERO) {
        if (body === 'sí' || body === 'si' || body === 'confirmo') {
          cliente.pago_confirmado = true;
          await client.sendText(from, `✅ Pago confirmado para ${cliente.nombre}. Envía el link de Google Meet.`);
          await client.sendText(TU_NUMERO, `✅ Pago confirmado. Envía el link para ${cliente.nombre}.`);
          cliente.etapa = 'esperando_link';
        } else if (body === 'no') {
          await client.sendText(from, `❌ Rechazaste el pago de ${cliente.nombre}.`);
          await client.sendText(cliente.from, '❌ Error: No se confirmó tu pago. Verifica e intenta nuevamente.');
          delete CLIENTES[from];
        } else {
          await client.sendText(TU_NUMERO, '⚠️ Responde "SÍ" o "NO" para confirmar el pago.');
        }
        return;
      }

      // === PASO 5: RECIBIR LINK ===
      if (cliente.etapa === 'esperando_link' && from === TU_NUMERO) {
        if (body.includes('meet.google.com') || body.includes('https://')) {
          await client.sendText(cliente.from, `✅ Pago exitoso. Aquí está tu link:\n${body}`);
          await client.sendText(TU_NUMERO, `✅ Link enviado a ${cliente.nombre}`);
          cliente.etapa = 'atendido_por_ia';
        } else {
          await client.sendText(TU_NUMERO, '⚠️ Envía un link válido de Google Meet.');
        }
        return;
      }

      // === PASO 6: ATENCIÓN CON IA ===
      if (cliente.etapa === 'atendido_por_ia' && cliente.pago_confirmado) {
        await client.sendText(from, '⏳ Pensando...');
        const respuesta = await getIAResponse(body);
        await client.sendText(from, respuesta);
        return;
      }

      // === PASO 7: MENSAJE POR DEFECTO ===
      if (from !== TU_NUMERO) {
        const mensajes = {
          'esperando_nombre': '⚠️ Por favor, responde con tu nombre completo.',
          'esperando_captura': '⚠️ Envía la captura de tu pago por Yape.',
          'esperando_confirmacion': '⏳ Validando tu pago. Espera un momento.',
          'esperando_link': '⏳ En breve recibirás el link de la reunión.'
        };
        await client.sendText(from, mensajes[cliente.etapa] || '⚠️ Sigue las instrucciones para completar tu consulta.');
      }

    } catch (error) {
      console.error('❌ Error:', error);
      if (from !== TU_NUMERO) {
        await client.sendText(from, '⚠️ Hubo un error. Intenta de nuevo.');
      }
    }
  });
}
