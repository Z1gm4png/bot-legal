const venom = require('venom-bot');
const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TU_NUMERO = '51994058951@c.us';
const TU_NOMBRE = 'Miguel';

const CLIENTES = {};

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
          {"role": "system", "content": `Eres el asistente legal del abogado ${TU_NOMBRE}.`},
          {"role": "user", "content": message}
        ]
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    return 'Lo siento, hubo un error. Intenta de nuevo.';
  }
}

venom.create({
  session: 'bot-legal',
  headless: true,
  multidevice: true
})
.then((client) => start(client))
.catch((error) => console.log('Error:', error));

function start(client) {
  console.log('🔥 BOT INICIADO!');

  client.onMessage(async (message) => {
    const from = message.from;
    const body = message.body ? message.body.toLowerCase().trim() : '';
    const isGroup = message.isGroupMsg;
    const isMedia = message.type === 'image';

    if (isGroup) return;

    if (!CLIENTES[from]) {
      CLIENTES[from] = { etapa: 'inicio', nombre: '', pago_confirmado: false };
    }

    const cliente = CLIENTES[from];

    try {
      if (cliente.etapa === 'inicio') {
        await client.sendText(from, `👋 Hola, soy el asistente del abogado ${TU_NOMBRE}. ¿Me das tu nombre completo?`);
        cliente.etapa = 'esperando_nombre';
        return;
      }

      if (cliente.etapa === 'esperando_nombre') {
        cliente.nombre = body;
        await client.sendText(from, `✅ Gracias, ${cliente.nombre}. Realiza el pago de S/.50 por Yape al 994058951 y envía la captura.`);
        cliente.etapa = 'esperando_captura';
        return;
      }

      if (isMedia && cliente.etapa === 'esperando_captura') {
        await client.sendImage(TU_NUMERO, message.body, 'captura.png', `📸 Pago de ${cliente.nombre}`);
        await client.sendText(from, '⏳ Validando pago...');
        cliente.etapa = 'esperando_confirmacion';
        return;
      }

      if (cliente.etapa === 'esperando_confirmacion' && from === TU_NUMERO) {
        if (body === 'sí' || body === 'si') {
          cliente.pago_confirmado = true;
          await client.sendText(from, '✅ Envía el link de Meet');
          cliente.etapa = 'esperando_link';
        } else {
          await client.sendText(from, '❌ Pago rechazado');
          delete CLIENTES[from];
        }
        return;
      }

      if (cliente.etapa === 'esperando_link' && from === TU_NUMERO) {
        await client.sendText(cliente.from, `✅ Link: ${body}`);
        cliente.etapa = 'atendido_por_ia';
        return;
      }

      if (cliente.etapa === 'atendido_por_ia' && cliente.pago_confirmado) {
        const respuesta = await getIAResponse(body);
        await client.sendText(from, respuesta);
        return;
      }

    } catch (error) {
      console.error('Error:', error);
    }
  });
}
