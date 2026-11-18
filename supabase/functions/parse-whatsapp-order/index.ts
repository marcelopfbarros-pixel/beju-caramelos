import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CatalogItem {
  id: string;
  sku: string;
  descricao: string;
  precoUnitario: number;
  unidade: string;
}

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview'
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'GEMINI_API_KEY_NOT_SET',
          message: 'GEMINI_API_KEY não configurada nos Secrets do Supabase.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { rawText, catalog, units, currentDate } = await req.json();

    if (!rawText || typeof rawText !== 'string') {
      return new Response(
        JSON.stringify({ success: false, message: 'Texto do WhatsApp não informado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const catalogText = ((catalog as CatalogItem[]) || [])
      .map(
        p =>
          `- ID: "${p.id}" | SKU: ${p.sku} | Nome: "${p.descricao}" | Preço: R$ ${p.precoUnitario.toFixed(
            2
          )} | Unid: ${p.unidade}`
      )
      .join('\n');

    const unitsText = (units || [])
      .map((u: any) => `- ID: "${u.id}" | Nome: "${u.nome}" | Tipo: ${u.tipo}`)
      .join('\n');

    const prompt = `Você é um assistente operacional da confeitaria artesanal "JuJu Delivery".
Analise a conversa/mensagem de WhatsApp abaixo e extraia os dados estruturados do pedido.

Data/hora atual de referência: ${currentDate || new Date().toISOString()}

CATÁLOGO OFICIAL DE PRODUTOS:
${catalogText}

UNIDADES / LOJAS DISPONÍVEIS:
${unitsText}

MENSAGEM DO WHATSAPP:
"""
${rawText}
"""

REGRAS DE EXTRAÇÃO:
1. Casamento de Produtos: Compare os itens pedidos no texto com o CATÁLOGO OFICIAL. Quando encontrar correspondência (mesmo que o cliente use nome abreviado, ex: "red velvet", "macarons", "coxinha", "tartelette"), preencha o "produtoId" exato do catálogo e a "quantidade".
2. Itens não encontrados ou ambíguos: Liste-os em "unmatchedItems" para que o atendente revise manualmente, e também inclua um resumo em "observacoes".
3. Modalidade: Use "RETIRADA" se o cliente disser que vai buscar/retirar na loja; caso contrário use "DELIVERY".
4. Pagamento: Mapeie para 'pix', 'debito', 'credito' ou 'dinheiro'. Se mencionar troco (ex: "troco para 200"), preencha "trocoPara" com o valor numérico.
5. Data/Hora de Entrega: Retorne no formato ISO local "YYYY-MM-DDTHH:mm" (ex: "2026-11-14T17:00"). Se o cliente disser "hoje às 17h", use a data de referência.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        clienteNome: { type: "STRING" },
        clienteTelefone: { type: "STRING" },
        tipoEntrega: { type: "STRING", enum: ["DELIVERY", "RETIRADA"] },
        enderecoEntrega: { type: "STRING" },
        unidadeSugeridaId: { type: "STRING" },
        dataHoraEntrega: { type: "STRING" },
        formaPagamento: { type: "STRING", enum: ["pix", "debito", "credito", "dinheiro"] },
        trocoPara: { type: "NUMBER" },
        observacoes: { type: "STRING" },
        itens: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              produtoId: { type: "STRING" },
              quantidade: { type: "NUMBER" },
              observacoes: { type: "STRING" }
            },
            required: ["produtoId", "quantidade"]
          }
        },
        unmatchedItems: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      },
      required: ["clienteNome", "tipoEntrega", "formaPagamento", "itens", "unmatchedItems"]
    };

    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1
      }
    });

    let lastErrorText = '';
    for (const modelName of GEMINI_MODELS) {
      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        }
      );

      if (geminiResp.ok) {
        const geminiData = await geminiResp.json();
        const rawJsonText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsedOrder = JSON.parse(rawJsonText);
          return new Response(
            JSON.stringify({
              success: true,
              source: 'gemini',
              model: modelName,
              data: parsedOrder
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        lastErrorText = await geminiResp.text();
        console.warn(`Modelo ${modelName} indisponível, tentando próximo:`, lastErrorText);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        code: 'GEMINI_API_ERROR',
        message: lastErrorText || 'Nenhum modelo Gemini respondeu com sucesso.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Erro na Edge Function parse-whatsapp-order:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
