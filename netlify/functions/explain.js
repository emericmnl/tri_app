// /netlify/functions/explain.js
export default async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const body = await req.json();

    const { epci, product_name, brand, material_primary, mats_list, bin } = body || {};
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json({ error: 'Missing OPENAI_API_KEY' }, 500);

    const systemPrompt = `Tu es un assistant d'éco-tri pour la France. Réponds STRICTEMENT en JSON avec ce schéma:
{
  "explication": "string",
  "confiance": 0.0
}
Règles:
- 2 phrases maximum, claires, concrètes.
- Si bac = "verre" : mentionner "retirer les bouchons/capsules".
- Si bac = "poubelle_jaune" et materiau_principal ∈ {pet, pp, pe, plastique} : dire "laisser le bouchon".
- Si bac = "ordures_menageres" : préciser "non recyclable dans le bac de tri".
- Ne jamais ajouter autre chose que le JSON.`;

    const userPayload = {
      epci,
      produit: product_name,
      marque: brand,
      materiau_principal: material_primary,
      tags_matiere: mats_list,
      bac: bin
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return json({ error: 'LLM error', detail: t }, 502);
    }

    const data = await resp.json();
    let content = data?.choices?.[0]?.message?.content || '{}';

    let out;
    try { out = JSON.parse(content); }
    catch { out = { explication: "Vérifiez la consigne de tri locale.", confiance: 0.6 }; }

    if (typeof out.explication !== 'string') out.explication = "Vérifiez la consigne de tri locale.";
    if (typeof out.confiance !== 'number') out.confiance = 0.7;

    return json(out, 200);
  } catch (e) {
    return json({ error: 'Server error', detail: String(e) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
