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
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite'
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
1. Casamento de Produtos: Compare os itens pedidos no texto com o CATÁLOGO OFICIAL. Inclua APENAS os produtos que o cliente realmente pediu — se houver vários sabores ou tamanhos parecidos no catálogo, escolha SOMENTE o produto mais específico correspondente (1 item por solicitação), nunca adicione variações extras e nunca confunda o nome da loja/marca (ex: "Beju Caramelos") ou endereços com itens do pedido. Preencha o "produtoId" exato e a "quantidade".
2. Itens não encontrados ou ambíguos: Liste-os em "unmatchedItems" para que o atendente revise manualmente, e também inclua um resumo em "observacoes".
3. Modalidade: Use "RETIRADA" se o cliente disser que vai buscar/retirar na loja; caso contrário use "DELIVERY".
4. Pagamento: Mapeie para 'pix', 'debito', 'credito' ou 'dinheiro'. Se mencionar troco (ex: "troco para 200"), preencha "trocoPara" com o valor numérico.
5. Faixa de Data/Hora de Entrega ou Retirada: Retorne "dataHoraEntrega" (início) e "dataHoraEntregaFim" (fim) no formato ISO local "YYYY-MM-DDTHH:mm" (ex: "2026-11-14T14:30" e "2026-11-14T17:30"). Se o cliente informar uma faixa (ex: "das 14h às 16h"), use início e fim exatos. O padrão de +1 hora em "dataHoraEntregaFim" só deve ser usado quando o horário final não for especificado.
6. Desconto: Preencha "desconto" APENAS com o valor abatido em reais (R$), NUNCA com o total final a pagar. Se a conversa disser "desconto de R$ 20", retorne 20. Se disser "10% de desconto", calcule 10% do subtotal dos itens. Se disser "com desconto fica R$ 120" (informando o total final), retorne apenas a diferença (subtotal - 120) se positiva. Caso não haja desconto, retorne 0.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        clienteNome: { type: "STRING" },
        clienteTelefone: { type: "STRING" },
        tipoEntrega: { type: "STRING", enum: ["DELIVERY", "RETIRADA"] },
        enderecoEntrega: { type: "STRING" },
        unidadeSugeridaId: { type: "STRING" },
        dataHoraEntrega: { type: "STRING" },
        dataHoraEntregaFim: { type: "STRING" },
        formaPagamento: { type: "STRING", enum: ["pix", "debito", "credito", "dinheiro"] },
        trocoPara: { type: "NUMBER" },
        desconto: { type: "NUMBER" },
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
      required: ["clienteNome", "tipoEntrega", "dataHoraEntrega", "formaPagamento", "itens", "unmatchedItems"]
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
      try {
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal: AbortSignal.timeout(6000)
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
      } catch (fetchErr: any) {
        lastErrorText = fetchErr?.message || `Timeout/erro ao chamar ${modelName}`;
        console.warn(`Falha/timeout no modelo ${modelName}:`, lastErrorText);
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
